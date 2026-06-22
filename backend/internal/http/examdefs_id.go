package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// GetExamDefinition handles GET /exam-definitions/{id}: returns the single exam
// definition or a 404 Problem{NOT_FOUND} when it does not exist (CONTRACTS.md
// §C04/§C11). Parent-guarded.
func (h *Handlers) GetExamDefinition(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	e, err := h.Store.GetExamDefinition(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "exam definition not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, examDefToContract(e))
}

// UpdateExamDefinition handles PUT /exam-definitions/{id}: replaces the exam
// definition's mutable fields. Returns 404 when missing and 400 when the name is
// blank. Parent-guarded (CONTRACTS.md §C04).
func (h *Handlers) UpdateExamDefinition(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.UpdateExamDefinitionJSONRequestBody
	if !decodeJSON(w, r, &body) {
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		badRequest(w, "name is required")
		return
	}

	scope := body.ScopeTopicIds
	if scope == nil {
		scope = []string{}
	}

	updated, err := h.Store.UpdateExamDefinition(r.Context(), store.UpdateExamDefinitionParams{
		ID:            id,
		Name:          name,
		Type:          string(body.Type),
		ScopeTopicIds: scope,
		Size:          int32(body.Size),
		PassBar:       int32(body.PassBar),
		CooldownMin:   int32(body.CooldownMin),
		RewardStyle:   string(body.RewardStyle),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "exam definition not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, examDefToContract(updated))
}

// DeleteExamDefinition handles DELETE /exam-definitions/{id}: removes the exam
// definition (attempts cascade per D04). Returns 404 when missing, 204 on
// success. Parent-guarded.
func (h *Handlers) DeleteExamDefinition(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	if _, err := h.Store.GetExamDefinition(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "exam definition not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	if err := h.Store.DeleteExamDefinition(r.Context(), id); err != nil {
		internalError(w, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
