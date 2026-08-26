package http

import (
	"context"
	"net/http"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// recentGrantsLimit is how many grants GuardianStatus.recent carries.
const recentGrantsLimit = 20

// GetGuardianStatus handles GET /guardian/status (3-A09). Parent-only. When
// the Guardian is not wired it still answers 200 with enabled=false so the
// parent UI can render the "enable Guardian" page (3-P06).
func (h *Handlers) GetGuardianStatus(w http.ResponseWriter, r *http.Request) {
	if _, ok := parentFromReq(r); !ok {
		unauthorized(w)
		return
	}
	if h.Guardian == nil {
		writeJSON(w, http.StatusOK, contracts.GuardianStatus{
			Enabled:     false,
			Paused:      true,
			Wall:        contracts.Fake,
			WallHealthy: false,
			Active:      []contracts.GuardianGrant{},
			Recent:      []contracts.GuardianGrant{},
			DailyUsage:  []contracts.GuardianDailyUsage{},
			Devices:     []contracts.GuardianDevice{},
		})
		return
	}
	ctx := r.Context()

	policy, _, err := h.effectiveGuardianPolicy(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	status := contracts.GuardianStatus{
		Enabled: true,
		Paused:  !policy.Enabled,
		Wall:    policy.Wall,
	}

	pingCtx, cancel := context.WithTimeout(ctx, wallPingTimeout)
	if err := h.Guardian.Wall.Ping(pingCtx); err != nil {
		msg := err.Error()
		status.WallError = &msg
	} else {
		status.WallHealthy = true
	}
	cancel()

	names, err := h.guardianDeviceNames(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	now := h.Guardian.now()

	active, err := h.Guardian.Sessions.Active(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	status.Active = toContractGuardianGrants(active, names, now)

	recent, err := h.Store.ListRecentGuardianGrants(ctx, recentGrantsLimit)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	status.Recent = toContractGuardianGrants(recent, names, now)

	today, todayKey := h.guardianToday()
	usageRows, err := h.Store.ListGuardianDailyUsageSince(ctx, today)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	capMinutes := policy.DailyCapHours * 60
	status.DailyUsage = []contracts.GuardianDailyUsage{}
	for _, u := range usageRows {
		if dayKey(u.Day) != todayKey {
			continue
		}
		status.DailyUsage = append(status.DailyUsage, toContractDailyUsage(u, capMinutes))
	}

	devices, err := h.Store.ListGuardianDevices(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	status.Devices = toContractGuardianDevices(devices)

	writeJSON(w, http.StatusOK, status)
}
