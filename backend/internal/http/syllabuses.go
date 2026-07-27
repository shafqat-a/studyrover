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

// ListSyllabuses handles GET /syllabuses: every syllabus (the curriculum
// grouping above subjects, e.g. "Class V"), oldest first. There are few per
// household, so the list is a plain array rather than a page. Any session may
// read them (the student home groups subjects by syllabus too).
func (h *Handlers) ListSyllabuses(w http.ResponseWriter, r *http.Request) {
	if !hasSession(r) {
		unauthorized(w)
		return
	}

	rows, err := h.Store.ListSyllabuses(r.Context())
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Syllabus, 0, len(rows))
	for i := range rows {
		items = append(items, toContractSyllabus(rows[i]))
	}

	writeJSON(w, http.StatusOK, items)
}

// CreateSyllabus handles POST /syllabuses: validates the CreateSyllabus body
// and inserts a new syllabus, returning 201. Parent-guarded.
func (h *Handlers) CreateSyllabus(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateSyllabus
	if !decodeJSON(w, r, &body) {
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		badRequest(w, "name is required")
		return
	}

	created, err := h.Store.CreateSyllabus(r.Context(), store.CreateSyllabusParams{
		Name:        body.Name,
		Description: body.Description,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, toContractSyllabus(created))
}

// UpdateSyllabus handles PUT /syllabuses/{id}: a partial update of the
// syllabus's mutable fields (name, description). Parent-guarded.
func (h *Handlers) UpdateSyllabus(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.UpdateSyllabusJSONRequestBody
	if !decodeJSON(w, r, &body) {
		return
	}

	name := strings.TrimSpace(body.Name)
	if name == "" {
		badRequest(w, "name is required")
		return
	}

	updated, err := h.Store.UpdateSyllabus(r.Context(), store.UpdateSyllabusParams{
		ID:          id,
		Name:        &name,
		Description: body.Description,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "syllabus not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractSyllabus(updated))
}

// DeleteSyllabus handles DELETE /syllabuses/{id}: removes the syllabus. Its
// subjects survive and are un-grouped by the database (ON DELETE SET NULL).
// Returns 404 when missing and 204 on success. Parent-guarded.
func (h *Handlers) DeleteSyllabus(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	if _, err := h.Store.GetSyllabus(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "syllabus not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	if err := h.Store.DeleteSyllabus(r.Context(), id); err != nil {
		internalError(w, err.Error())
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// toContractSyllabus maps a sqlc store.Syllabus to the generated contract type.
func toContractSyllabus(s store.Syllabus) contracts.Syllabus {
	return contracts.Syllabus{
		Id:          s.ID,
		Name:        s.Name,
		Description: s.Description,
		CreatedAt:   s.CreatedAt,
	}
}
