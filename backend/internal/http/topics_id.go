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

// GetTopic handles GET /topics/{id}: returns the single topic or a 404
// Problem{NOT_FOUND} envelope when it does not exist (CONTRACTS.md §C03/§C11).
// Parent-guarded.
func (h *Handlers) GetTopic(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	t, err := h.Store.GetTopic(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "topic not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractTopic(t))
}

// UpdateTopic handles PUT /topics/{id}: updates the topic's mutable fields,
// including reordering via order and toggling active. The owning subject is
// fixed at creation, so the body's subjectId is ignored — the topic stays
// parent-guarded to its original subject. Returns 404 when the topic is missing
// and 400 when the name is blank or the page range is inverted (CONTRACTS.md
// §C03). Parent-guarded.
func (h *Handlers) UpdateTopic(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.UpdateTopicJSONRequestBody
	if !decodeJSON(w, r, &body) {
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		badRequest(w, "name is required")
		return
	}

	if body.PageStart != nil && body.PageEnd != nil && *body.PageEnd < *body.PageStart {
		badRequest(w, "pageEnd must be >= pageStart")
		return
	}

	order := body.Order
	active := body.Active

	updated, err := h.Store.UpdateTopic(r.Context(), store.UpdateTopicParams{
		ID:           id,
		Name:         &name,
		SetSourceID:  body.SourceId != nil,
		SourceID:     body.SourceId,
		SetPageStart: body.PageStart != nil,
		PageStart:    body.PageStart,
		SetPageEnd:   body.PageEnd != nil,
		PageEnd:      body.PageEnd,
		SortOrder:    &order,
		Active:       &active,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "topic not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractTopic(updated))
}

// DeleteTopic handles DELETE /topics/{id}: removes the topic and lets the
// database cascade dependent rows. Returns 404 when the topic does not exist and
// 204 on success. Parent-guarded.
func (h *Handlers) DeleteTopic(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	// Confirm existence first so a missing topic yields a 404 envelope rather
	// than a silent 204 (DELETE itself is idempotent at the SQL layer).
	if _, err := h.Store.GetTopic(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "topic not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	if err := h.Store.DeleteTopic(r.Context(), id); err != nil {
		internalError(w, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
