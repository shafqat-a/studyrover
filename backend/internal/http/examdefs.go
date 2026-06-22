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

// ListExamDefinitions handles GET /exam-definitions?subjectId=...: a
// parent-guarded, paginated list of exam definitions scoped to a single subject
// (PageOfExamDefinition, CONTRACTS.md §C04/§C11). The subjectId query parameter
// is required; without it the request is rejected with 400 Problem{VALIDATION}.
func (h *Handlers) ListExamDefinitions(w http.ResponseWriter, r *http.Request, params contracts.ListExamDefinitionsParams) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	if params.SubjectId == nil || strings.TrimSpace(*params.SubjectId) == "" {
		badRequest(w, "subjectId is required")
		return
	}
	subjectID := strings.TrimSpace(*params.SubjectId)

	page, pageSize, limit, offset := pagination(r)

	rows, err := h.Store.ListExamDefinitionsBySubject(r.Context(), store.ListExamDefinitionsBySubjectParams{
		SubjectID: subjectID,
		Limit:     int32(limit),
		Offset:    int32(offset),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	total, err := h.Store.CountExamDefinitionsBySubject(r.Context(), subjectID)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.ExamDefinition, 0, len(rows))
	for i := range rows {
		items = append(items, examDefToContract(rows[i]))
	}

	writeJSON(w, http.StatusOK, contracts.PageOfExamDefinition{
		Items:    items,
		Total:    int(total),
		Page:     page,
		PageSize: pageSize,
	})
}

// CreateExamDefinition handles POST /exam-definitions: validates the
// CreateExamDefinition body and inserts a new exam template, applying the spec
// §10 defaults (size 20, passBar 70, cooldown 10, reward style flat, type gate,
// empty scope = whole subject) for any omitted field. Numeric defaults come from
// the settings singleton when present, otherwise from core.DefaultSettings.
// Returns 201 with the created ExamDefinition (CONTRACTS.md §C04). Parent-guarded.
func (h *Handlers) CreateExamDefinition(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateExamDefinition
	if !decodeJSON(w, r, &body) {
		return
	}

	body.SubjectId = strings.TrimSpace(body.SubjectId)
	if body.SubjectId == "" {
		badRequest(w, "subjectId is required")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		badRequest(w, "name is required")
		return
	}

	// Resolve spec defaults for omitted numeric fields from the settings
	// singleton (falling back to core.DefaultSettings when no row exists).
	defaults := h.resolveExamDefaults(r)

	size := defaults.DefaultExamSize
	if body.Size != nil {
		size = *body.Size
	}
	passBar := defaults.DefaultPassBar
	if body.PassBar != nil {
		passBar = *body.PassBar
	}
	cooldown := defaults.DefaultCooldownMin
	if body.CooldownMin != nil {
		cooldown = *body.CooldownMin
	}

	rewardStyle := contracts.Flat
	if body.RewardStyle != nil {
		rewardStyle = *body.RewardStyle
	}
	switch rewardStyle {
	case contracts.Flat, contracts.Scaled:
	default:
		badRequest(w, "rewardStyle must be flat or scaled")
		return
	}

	examType := contracts.Gate
	if body.Type != nil {
		examType = *body.Type
	}
	switch examType {
	case contracts.Gate, contracts.Formal:
	default:
		badRequest(w, "type must be gate or formal")
		return
	}

	if size < 1 {
		badRequest(w, "size must be >= 1")
		return
	}
	if passBar < 0 || passBar > 100 {
		badRequest(w, "passBar must be between 0 and 100")
		return
	}
	if cooldown < 0 {
		badRequest(w, "cooldownMin must be >= 0")
		return
	}

	// Empty scope means the whole subject. Normalise nil -> empty slice so the
	// stored column and contract response are a non-null array.
	scope := []string{}
	if body.ScopeTopicIds != nil {
		scope = *body.ScopeTopicIds
	}

	created, err := h.Store.CreateExamDefinition(r.Context(), store.CreateExamDefinitionParams{
		SubjectID:     body.SubjectId,
		Name:          body.Name,
		Type:          string(examType),
		ScopeTopicIds: scope,
		Size:          int32(size),
		PassBar:       int32(passBar),
		CooldownMin:   int32(cooldown),
		RewardStyle:   string(rewardStyle),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, examDefToContract(created))
}

// resolveExamDefaults returns the effective settings used to fill omitted exam
// definition fields. It reads the settings singleton and folds in the spec
// defaults; when no row exists it returns core.DefaultSettings.
func (h *Handlers) resolveExamDefaults(r *http.Request) contracts.Settings {
	row, err := h.Store.GetSettings(r.Context())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return core.ResolveSettings(nil)
		}
		// On any other read error, fall back to spec defaults rather than
		// failing the create; the defaults are well-defined.
		return core.ResolveSettings(nil)
	}
	stored := contracts.Settings{
		Id:                 row.ID,
		RewardRateMinPerQ:  int(row.RewardRateMinPerQ),
		DailyCapHours:      int(row.DailyCapHours),
		DefaultExamSize:    int(row.DefaultExamSize),
		DefaultPassBar:     int(row.DefaultPassBar),
		DefaultCooldownMin: int(row.DefaultCooldownMin),
		KnowledgeBackend:   contracts.KnowledgeBackend(row.KnowledgeBackend),
		DifficultyRamp:     row.DifficultyRamp,
	}
	return core.ResolveSettings(&stored)
}

// examDefToContract maps a sqlc store.ExamDefinition to the generated contract
// type. Both use string ids; the scope is normalised to a non-null array
// (empty = whole subject).
func examDefToContract(e store.ExamDefinition) contracts.ExamDefinition {
	scope := e.ScopeTopicIds
	if scope == nil {
		scope = []string{}
	}
	return contracts.ExamDefinition{
		Id:            e.ID,
		SubjectId:     e.SubjectID,
		Name:          e.Name,
		Type:          contracts.ExamType(e.Type),
		ScopeTopicIds: scope,
		Size:          int(e.Size),
		PassBar:       int(e.PassBar),
		CooldownMin:   int(e.CooldownMin),
		RewardStyle:   contracts.RewardStyle(e.RewardStyle),
		CreatedAt:     e.CreatedAt,
	}
}
