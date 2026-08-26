package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/guardian/wall"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ListGuardianDevices handles GET /guardian/devices (3-A01). Parent-only.
func (h *Handlers) ListGuardianDevices(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	rows, err := h.Store.ListGuardianDevices(r.Context())
	if err != nil {
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, toContractGuardianDevices(rows))
}

// CreateGuardianDevice handles POST /guardian/devices (3-A01): registers a
// device by MAC (normalised), defaulting studentId to the single student and
// gated to true. A gated device is gated on the wall before the row is
// persisted so the parent learns about a broken wall immediately; the row is
// only created when the wall accepted the rule. Duplicate MAC → 409.
func (h *Handlers) CreateGuardianDevice(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	var body contracts.CreateGuardianDevice
	if !decodeJSON(w, r, &body) {
		return
	}
	ctx := r.Context()

	name := strings.TrimSpace(body.Name)
	if name == "" {
		badRequest(w, "name is required")
		return
	}
	mac, err := wall.NormalizeMAC(body.Mac)
	if err != nil {
		badRequest(w, "mac: "+err.Error())
		return
	}

	studentID := ""
	if body.StudentId != nil {
		studentID = strings.TrimSpace(*body.StudentId)
	}
	if studentID == "" {
		s, err := h.Store.GetStudent(ctx)
		if err != nil {
			if isNoRows(err) {
				badRequest(w, "no student profile exists yet; create one before registering devices")
				return
			}
			internalError(w, err.Error())
			return
		}
		studentID = s.ID
	} else if _, err := h.Store.GetStudentByID(ctx, studentID); err != nil {
		if isNoRows(err) {
			badRequest(w, "studentId: unknown student")
			return
		}
		internalError(w, err.Error())
		return
	}

	if _, err := h.Store.GetGuardianDeviceByMAC(ctx, mac); err == nil {
		conflict(w, "a device with mac "+mac+" is already registered")
		return
	} else if !isNoRows(err) {
		internalError(w, err.Error())
		return
	}

	gated := true
	if body.Gated != nil {
		gated = *body.Gated
	}
	if gated {
		if err := h.Guardian.Wall.Gate(ctx, mac, true); err != nil {
			wallError(w, "gate "+mac, err)
			return
		}
	}

	row, err := h.Store.CreateGuardianDevice(ctx, store.CreateGuardianDeviceParams{
		StudentID: studentID,
		Name:      name,
		Mac:       mac,
		Ip:        trimPtr(body.Ip),
		Hostname:  trimPtr(body.Hostname),
		Gated:     gated,
	})
	if err != nil {
		if gated {
			// Best effort: do not leave a rule for a device we failed to record.
			_ = h.Guardian.Wall.Gate(ctx, mac, false)
		}
		if isUniqueViolation(err) {
			conflict(w, "a device with mac "+mac+" is already registered")
			return
		}
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, toContractGuardianDevice(row))
}

// GetGuardianDevice handles GET /guardian/devices/{id} (3-A02). Parent-only.
func (h *Handlers) GetGuardianDevice(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	row, err := h.Store.GetGuardianDevice(r.Context(), id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "device not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, toContractGuardianDevice(row))
}

// UpdateGuardianDevice handles PUT /guardian/devices/{id} (3-A02): partial
// update. The row is saved first, then the wall is reconciled: a MAC change
// closes the device's open grants and moves the gate rule; a gated toggle
// installs/removes the rule. A wall failure after the save is reported as 502
// so the parent can retry (Gate is idempotent).
func (h *Handlers) UpdateGuardianDevice(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	var body contracts.UpdateGuardianDevice
	if !decodeJSON(w, r, &body) {
		return
	}
	ctx := r.Context()

	existing, err := h.Store.GetGuardianDevice(ctx, id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "device not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	params := store.UpdateGuardianDeviceParams{
		ID:       id,
		Ip:       trimPtr(body.Ip),
		Hostname: trimPtr(body.Hostname),
		Gated:    body.Gated,
	}
	if body.Name != nil {
		name := strings.TrimSpace(*body.Name)
		if name == "" {
			badRequest(w, "name must not be empty")
			return
		}
		params.Name = &name
	}

	newMac := existing.Mac
	if body.Mac != nil {
		mac, err := wall.NormalizeMAC(*body.Mac)
		if err != nil {
			badRequest(w, "mac: "+err.Error())
			return
		}
		if mac != existing.Mac {
			if other, err := h.Store.GetGuardianDeviceByMAC(ctx, mac); err == nil && other.ID != id {
				conflict(w, "a device with mac "+mac+" is already registered")
				return
			} else if err != nil && !isNoRows(err) {
				internalError(w, err.Error())
				return
			}
			params.Mac = &mac
			newMac = mac
		}
	}
	newGated := existing.Gated
	if body.Gated != nil {
		newGated = *body.Gated
	}

	row, err := h.Store.UpdateGuardianDevice(ctx, params)
	if err != nil {
		if isUniqueViolation(err) {
			conflict(w, "a device with mac "+newMac+" is already registered")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Reconcile the wall with the saved row.
	macChanged := newMac != existing.Mac
	if macChanged {
		if err := h.Guardian.Sessions.RevokeDevice(ctx, id); err != nil {
			internalError(w, "device saved but revoking its open grants failed: "+err.Error())
			return
		}
		if existing.Gated {
			if err := h.Guardian.Wall.Gate(ctx, existing.Mac, false); err != nil {
				wallError(w, "device saved but ungating old mac "+existing.Mac, err)
				return
			}
		}
		if newGated {
			if err := h.Guardian.Wall.Gate(ctx, newMac, true); err != nil {
				wallError(w, "device saved but gating "+newMac, err)
				return
			}
		}
	} else if newGated != existing.Gated {
		if !newGated {
			// Ungating an active device: close its grants so the wall state is
			// consistent (an ungated device is always online anyway).
			if err := h.Guardian.Sessions.RevokeDevice(ctx, id); err != nil {
				internalError(w, "device saved but revoking its open grants failed: "+err.Error())
				return
			}
		}
		if err := h.Guardian.Wall.Gate(ctx, newMac, newGated); err != nil {
			wallError(w, "device saved but updating the gate for "+newMac, err)
			return
		}
	}

	writeJSON(w, http.StatusOK, toContractGuardianDevice(row))
}

// DeleteGuardianDevice handles DELETE /guardian/devices/{id} (3-A02): closes
// open grants, removes the wall rule, then deletes the row. 204.
func (h *Handlers) DeleteGuardianDevice(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	ctx := r.Context()
	existing, err := h.Store.GetGuardianDevice(ctx, id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "device not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	if err := h.Guardian.Sessions.RevokeDevice(ctx, id); err != nil {
		internalError(w, "revoking the device's open grants failed: "+err.Error())
		return
	}
	if err := h.Guardian.Wall.Gate(ctx, existing.Mac, false); err != nil {
		wallError(w, "ungate "+existing.Mac, err)
		return
	}
	n, err := h.Store.DeleteGuardianDevice(ctx, id)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	if n == 0 {
		notFound(w, "device not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// ScanGuardianDevices handles POST /guardian/devices/scan (3-A03): asks the
// wall which hosts it can see and flags the ones already registered.
func (h *Handlers) ScanGuardianDevices(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	ctx := r.Context()
	found, err := h.Guardian.Wall.Discover(ctx)
	if err != nil {
		wallError(w, "discover", err)
		return
	}
	registered, err := h.Store.ListGuardianDevices(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	known := make(map[string]bool, len(registered))
	for _, d := range registered {
		known[d.Mac] = true
	}
	out := make([]contracts.DiscoveredDevice, 0, len(found))
	for _, d := range found {
		mac := d.MAC
		if n, err := wall.NormalizeMAC(mac); err == nil {
			mac = n
		}
		dd := contracts.DiscoveredDevice{Mac: mac, Registered: known[mac]}
		if d.IP != "" {
			ip := d.IP
			dd.Ip = &ip
		}
		if d.Hostname != "" {
			host := d.Hostname
			dd.Hostname = &host
		}
		out = append(out, dd)
	}
	writeJSON(w, http.StatusOK, out)
}

// trimPtr trims a nullable string; an empty result stays nil (partial updates
// treat nil as "unchanged", and an empty helper field is not worth storing).
func trimPtr(p *string) *string {
	if p == nil {
		return nil
	}
	s := strings.TrimSpace(*p)
	if s == "" {
		return nil
	}
	return &s
}

// isUniqueViolation reports a Postgres unique-constraint failure (23505) so a
// race on the MAC unique index still maps to 409 instead of 500.
func isUniqueViolation(err error) bool {
	return err != nil && strings.Contains(err.Error(), "SQLSTATE 23505")
}
