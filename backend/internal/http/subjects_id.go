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

// GetSubject handles GET /subjects/{id}: returns the single subject or a 404
// Problem{NOT_FOUND} envelope when it does not exist (CONTRACTS.md §C01/§C11).
// Parent-guarded.
func (h *Handlers) GetSubject(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	s, err := h.Store.GetSubject(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractSubject(s))
}

// UpdateSubject handles PUT /subjects/{id}: a partial update of the subject's
// mutable fields. Only fields present in the body are applied (nil leaves the
// existing value untouched). Returns 404 when the subject is missing and 400
// when the supplied name is blank. Parent-guarded (CONTRACTS.md §C01).
func (h *Handlers) UpdateSubject(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.UpdateSubjectJSONRequestBody
	if !decodeJSON(w, r, &body) {
		return
	}

	// Validate the name only when the caller is trying to set it: a blank name
	// is never acceptable.
	name := strings.TrimSpace(body.Name)
	if name == "" {
		badRequest(w, "name is required")
		return
	}

	updated, err := h.Store.UpdateSubject(r.Context(), store.UpdateSubjectParams{
		ID:          id,
		Name:        &name,
		Color:       body.Color,
		Icon:        body.Icon,
		Description: body.Description,
		Archived:    &body.Archived,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractSubject(updated))
}

// DeleteSubject handles DELETE /subjects/{id}: removes the subject and lets the
// database cascade dependent rows (sources, topics, exams; see D01). Returns
// 404 when the subject does not exist and 204 on success. Parent-guarded.
func (h *Handlers) DeleteSubject(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	// Confirm existence first so a missing subject yields a 404 envelope rather
	// than a silent 204 (DELETE itself is idempotent at the SQL layer).
	if _, err := h.Store.GetSubject(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	if err := h.Store.DeleteSubject(r.Context(), id); err != nil {
		internalError(w, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
