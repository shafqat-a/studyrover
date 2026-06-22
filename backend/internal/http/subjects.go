package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ListSubjects handles GET /subjects: a parent-guarded, paginated list of
// subjects (PageOfSubject, CONTRACTS.md §C01/§C11). The RequireParent
// middleware mounted by W02 guards the route; the context check here keeps the
// handler safe in isolation and satisfies the "unauthed → 401" acceptance.
func (h *Handlers) ListSubjects(w http.ResponseWriter, r *http.Request, _ contracts.ListSubjectsParams) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	page, pageSize, limit, offset := pagination(r)

	// Default: exclude archived subjects. With ?includeArchived, a nil filter
	// makes the store return both archived and non-archived rows.
	var archived *bool
	if !includeArchived(r) {
		f := false
		archived = &f
	}

	rows, err := h.Store.ListSubjects(r.Context(), store.ListSubjectsParams{
		Limit:    int32(limit),
		Offset:   int32(offset),
		Archived: archived,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	total, err := h.Store.CountSubjects(r.Context(), archived)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Subject, 0, len(rows))
	for i := range rows {
		items = append(items, toContractSubject(rows[i]))
	}

	writeJSON(w, http.StatusOK, contracts.PageOfSubject{
		Items:    items,
		Total:    int(total),
		Page:     page,
		PageSize: pageSize,
	})
}

// CreateSubject handles POST /subjects: validates the CreateSubject body and
// inserts a new subject, returning 201 with the created Subject (CONTRACTS.md
// §C01).
func (h *Handlers) CreateSubject(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateSubject
	if !decodeJSON(w, r, &body) {
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		badRequest(w, "name is required")
		return
	}

	created, err := h.Store.CreateSubject(r.Context(), store.CreateSubjectParams{
		Name:        body.Name,
		Color:       body.Color,
		Icon:        body.Icon,
		Description: body.Description,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, toContractSubject(created))
}

// includeArchived reports whether GET /subjects asked to include archived
// subjects via the ?includeArchived query flag. A bare flag, "true", "1" or
// "yes" all count as true; anything else (including absence) is false.
func includeArchived(r *http.Request) bool {
	if !r.URL.Query().Has("includeArchived") {
		return false
	}
	switch strings.ToLower(strings.TrimSpace(r.URL.Query().Get("includeArchived"))) {
	case "", "true", "1", "yes":
		return true
	default:
		return false
	}
}

// toContractSubject maps a sqlc store.Subject to the generated contract type.
// Both use string ids; nullable columns are *T on each side.
func toContractSubject(s store.Subject) contracts.Subject {
	return contracts.Subject{
		Id:          s.ID,
		Name:        s.Name,
		Color:       s.Color,
		Icon:        s.Icon,
		Description: s.Description,
		Archived:    s.Archived,
		CreatedAt:   s.CreatedAt,
	}
}
