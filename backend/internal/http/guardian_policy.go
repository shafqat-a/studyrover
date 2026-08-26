package http

import (
	"net/http"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// Validation bounds for the editable policy knobs.
const (
	maxRateMinPerQ   = 600 // 10h per question is already absurd
	maxDailyCapHours = 24
)

// GetGuardianPolicy handles GET /guardian/policy (3-A04): the merged view of
// settings + guardian_policy + wall kind. Parent-only.
func (h *Handlers) GetGuardianPolicy(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	view, _, err := h.effectiveGuardianPolicy(r.Context())
	if err != nil {
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, view)
}

// UpdateGuardianPolicy handles PUT /guardian/policy (3-A04): partial update.
// rateMinPerQ / dailyCapHours are written to the platform settings singleton
// (they ARE Settings.rewardRateMinPerQ / dailyCapHours); enabled / rewardStyle
// / diminishingReturns go to guardian_policy. Returns the merged view.
func (h *Handlers) UpdateGuardianPolicy(w http.ResponseWriter, r *http.Request) {
	if _, ok := h.requireGuardianParent(w, r); !ok {
		return
	}
	var body contracts.UpdateGuardianPolicy
	if !decodeJSON(w, r, &body) {
		return
	}
	ctx := r.Context()

	if body.RateMinPerQ != nil && (*body.RateMinPerQ < 0 || *body.RateMinPerQ > maxRateMinPerQ) {
		badRequest(w, "rateMinPerQ must be between 0 and 600")
		return
	}
	if body.DailyCapHours != nil && (*body.DailyCapHours < 0 || *body.DailyCapHours > maxDailyCapHours) {
		badRequest(w, "dailyCapHours must be between 0 and 24")
		return
	}
	if body.RewardStyle != nil && !body.RewardStyle.Valid() {
		badRequest(w, "rewardStyle must be 'flat' or 'scaled'")
		return
	}

	if body.RateMinPerQ != nil || body.DailyCapHours != nil {
		// Partial upsert: nil interface params leave the existing value (or the
		// spec default on first insert) untouched.
		params := store.UpsertSettingsParams{}
		if body.RateMinPerQ != nil {
			params.RewardRateMinPerQ = int32(*body.RateMinPerQ)
		}
		if body.DailyCapHours != nil {
			params.DailyCapHours = int32(*body.DailyCapHours)
		}
		if _, err := h.Store.UpsertSettings(ctx, params); err != nil {
			internalError(w, err.Error())
			return
		}
	}

	if body.Enabled != nil || body.RewardStyle != nil || body.DiminishingReturns != nil {
		params := store.UpdateGuardianPolicyParams{
			Enabled:            body.Enabled,
			DiminishingReturns: body.DiminishingReturns,
		}
		if body.RewardStyle != nil {
			style := string(*body.RewardStyle)
			params.RewardStyle = &style
		}
		if _, err := h.Store.UpdateGuardianPolicy(ctx, params); err != nil {
			internalError(w, err.Error())
			return
		}
	}

	view, _, err := h.effectiveGuardianPolicy(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, view)
}
