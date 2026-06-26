package http

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// GetSource handles GET /sources/{id}: returns the single source or a 404
// Problem{NOT_FOUND} envelope when it does not exist (CONTRACTS.md §C02/§C11).
// Parent-guarded.
func (h *Handlers) GetSource(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	s, err := h.Store.GetSource(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "source not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractSource(s))
}

// DeleteSource handles DELETE /sources/{id}: removes the source, returning 204
// on success and a 404 Problem{NOT_FOUND} envelope when the source does not
// exist. Parent-guarded (CONTRACTS.md §C02).
func (h *Handlers) DeleteSource(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	// Confirm existence first so a missing source yields a 404 envelope rather
	// than a silent 204 (DELETE itself is idempotent at the SQL layer).
	if _, err := h.Store.GetSource(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "source not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	if err := h.Store.DeleteSource(r.Context(), id); err != nil {
		internalError(w, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
