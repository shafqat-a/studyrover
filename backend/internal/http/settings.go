package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// GetSettings handles GET /settings: returns the complete application settings
// singleton (CONTRACTS.md §C09). The stored row (if any) is passed through
// core.ResolveSettings (L10) so any missing or zero-valued field falls back to
// the spec defaults. When the singleton has never been written, no row exists
// and ResolveSettings(nil) yields the full default set. Parent-guarded.
func (h *Handlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	row, err := h.Store.GetSettings(r.Context())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusOK, core.ResolveSettings(nil))
			return
		}
		internalError(w, err.Error())
		return
	}

	stored := toContractSettings(row)
	writeJSON(w, http.StatusOK, core.ResolveSettings(&stored))
}

// UpdateSettings handles PUT /settings: validates the incoming Settings body and
// upserts the singleton row, returning the resolved (defaults-applied) settings
// (CONTRACTS.md §C09). Numeric knobs must be non-negative and the knowledge
// backend must be one of the supported values. Parent-guarded.
func (h *Handlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.Settings
	if !decodeJSON(w, r, &body) {
		return
	}

	if body.RewardRateMinPerQ < 0 {
		badRequest(w, "rewardRateMinPerQ must be >= 0")
		return
	}
	if body.DailyCapHours < 0 {
		badRequest(w, "dailyCapHours must be >= 0")
		return
	}
	if body.DefaultExamSize < 0 {
		badRequest(w, "defaultExamSize must be >= 0")
		return
	}
	if body.DefaultPassBar < 0 || body.DefaultPassBar > 100 {
		badRequest(w, "defaultPassBar must be between 0 and 100")
		return
	}
	if body.DefaultCooldownMin < 0 {
		badRequest(w, "defaultCooldownMin must be >= 0")
		return
	}

	backend := strings.TrimSpace(string(body.KnowledgeBackend))
	switch contracts.KnowledgeBackend(backend) {
	case "", contracts.KnowledgeBackendNotebooklm, contracts.KnowledgeBackendGemini:
		// ok
	default:
		badRequest(w, "knowledgeBackend must be 'notebooklm' or 'gemini'")
		return
	}

	updated, err := h.Store.UpsertSettings(r.Context(), store.UpsertSettingsParams{
		RewardRateMinPerQ:  int32(body.RewardRateMinPerQ),
		DailyCapHours:      int32(body.DailyCapHours),
		DefaultExamSize:    int32(body.DefaultExamSize),
		DefaultPassBar:     int32(body.DefaultPassBar),
		DefaultCooldownMin: int32(body.DefaultCooldownMin),
		KnowledgeBackend:   backend,
		DifficultyRamp:     body.DifficultyRamp,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	stored := toContractSettings(updated)
	writeJSON(w, http.StatusOK, core.ResolveSettings(&stored))
}

// toContractSettings maps a sqlc store.Setting to the generated contract type.
// Both use a string id; the store's int32 columns widen to the contract's int.
func toContractSettings(s store.Setting) contracts.Settings {
	return contracts.Settings{
		Id:                 s.ID,
		RewardRateMinPerQ:  int(s.RewardRateMinPerQ),
		DailyCapHours:      int(s.DailyCapHours),
		DefaultExamSize:    int(s.DefaultExamSize),
		DefaultPassBar:     int(s.DefaultPassBar),
		DefaultCooldownMin: int(s.DefaultCooldownMin),
		KnowledgeBackend:   contracts.KnowledgeBackend(s.KnowledgeBackend),
		DifficultyRamp:     s.DifficultyRamp,
	}
}
