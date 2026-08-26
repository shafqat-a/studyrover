package http

import (
	"log/slog"
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/guardian/session"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// maxManualGrantMinutes bounds a parent override (24h).
const maxManualGrantMinutes = 24 * 60

// overrideLogLimit is how many override entries GET /guardian/override-log returns.
const overrideLogLimit = 100

// ListGuardianSessions handles GET /guardian/sessions (3-A05): every grant
// open right now. Parent-only.
func (h *Handlers) ListGuardianSessions(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	ctx := r.Context()
	active, err := h.Guardian.Sessions.Active(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	names, err := h.guardianDeviceNames(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, toContractGuardianGrants(active, names, h.Guardian.now()))
}

// RevokeGuardianSession handles POST /guardian/sessions/{id}/revoke (3-A06):
// closes the grant on the wall and in the DB. Parent-only. 404 for unknown ids.
func (h *Handlers) RevokeGuardianSession(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	ctx := r.Context()
	if _, err := h.Store.GetGuardianGrant(ctx, id); err != nil {
		if isNoRows(err) {
			notFound(w, "grant not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	g, err := h.Guardian.Sessions.Revoke(ctx, id)
	if err != nil {
		if isNoRows(err) {
			notFound(w, "grant not found")
			return
		}
		internalError(w, "revoke: "+err.Error())
		return
	}
	name := ""
	if d, err := h.Store.GetGuardianDevice(ctx, g.DeviceID); err == nil {
		name = d.Name
	}
	writeJSON(w, http.StatusOK, toContractGuardianGrant(g, name, h.Guardian.now()))
}

// CreateGuardianGrant handles POST /guardian/grant (3-A07/3-A10): a parent
// override that opens `minutes` on a registered device now. Logged to the
// override log; does NOT count against the daily cap. Parent-only. 201.
func (h *Handlers) CreateGuardianGrant(w http.ResponseWriter, r *http.Request) {
	parent, ok := h.requireGuardianParent(w, r)
	if !ok {
		return
	}
	var body contracts.ManualGrant
	if !decodeJSON(w, r, &body) {
		return
	}
	ctx := r.Context()

	if body.Minutes <= 0 || body.Minutes > maxManualGrantMinutes {
		badRequest(w, "minutes must be between 1 and 1440")
		return
	}
	device, err := h.Store.GetGuardianDevice(ctx, strings.TrimSpace(body.DeviceId))
	if err != nil {
		if isNoRows(err) {
			notFound(w, "device not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	reason := trimPtr(body.Reason)

	g, err := h.Guardian.Sessions.Grant(ctx, session.Request{
		Device:  device,
		Minutes: body.Minutes,
		Source:  session.SourceManual,
		Reason:  derefOr(reason, ""),
	})
	if err != nil {
		wallError(w, "grant "+device.Mac, err)
		return
	}

	// The grant is open; an audit-log failure must not make the parent retry
	// (and double-grant), so it is logged rather than returned.
	if _, err := h.Store.InsertGuardianOverride(ctx, store.InsertGuardianOverrideParams{
		DeviceID:   device.ID,
		DeviceName: device.Name,
		Minutes:    int32(body.Minutes),
		Reason:     reason,
		Who:        parent.ID,
	}); err != nil {
		slog.Error("guardian: override granted but writing the override log failed", "grant", g.ID, "device", device.ID, "err", err)
	}

	writeJSON(w, http.StatusCreated, toContractGuardianGrant(g, device.Name, h.Guardian.now()))
}

// ListGuardianOverrideLog handles GET /guardian/override-log (3-A08): the last
// 100 parent overrides, newest first. Parent-only.
func (h *Handlers) ListGuardianOverrideLog(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	rows, err := h.Store.ListGuardianOverrides(r.Context(), overrideLogLimit)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	out := make([]contracts.GuardianOverrideLog, 0, len(rows))
	for _, o := range rows {
		out = append(out, toContractOverrideLog(o))
	}
	writeJSON(w, http.StatusOK, out)
}

func derefOr(p *string, def string) string {
	if p == nil {
		return def
	}
	return *p
}
