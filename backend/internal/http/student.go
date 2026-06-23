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

// GetStudent handles GET /student: returns the single student profile
// (CONTRACTS.md §C07). Single-student Phase 1 — the store returns the one
// (newest) student. A 404 Problem{NOT_FOUND} is returned before the profile is
// created on first save. Parent-guarded.
func (h *Handlers) GetStudent(w http.ResponseWriter, r *http.Request) {
	if !hasSession(r) {
		unauthorized(w)
		return
	}

	s, err := h.Store.GetStudent(r.Context())
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "student not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractStudent(s))
}

// UpdateStudent handles PUT /student: validates the partial Student body and
// upserts the single student profile, creating it on first save (CONTRACTS.md
// §C07). When a student already exists its id is reused so the upsert updates in
// place; otherwise a new profile is inserted. Parent-guarded.
func (h *Handlers) UpdateStudent(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.Student
	if !decodeJSON(w, r, &body) {
		return
	}

	body.Name = strings.TrimSpace(body.Name)

	// Resolve the target id: prefer the body id, then fall back to the existing
	// single student so an id-less PUT updates the current profile in place. A
	// nil id makes the upsert insert a brand-new student (create-on-first-save).
	var id interface{}
	if strings.TrimSpace(body.Id) != "" {
		id = strings.TrimSpace(body.Id)
	} else if existing, err := h.Store.GetStudent(r.Context()); err == nil {
		id = existing.ID
	} else if !errors.Is(err, pgx.ErrNoRows) {
		internalError(w, err.Error())
		return
	}

	// For a fresh insert the name is required; an update may omit it (the upsert
	// keeps the existing value when name is empty).
	var name interface{}
	if body.Name != "" {
		name = body.Name
	} else if id == nil {
		badRequest(w, "name is required")
		return
	}

	updated, err := h.Store.UpsertStudent(r.Context(), store.UpsertStudentParams{
		ID:         id,
		Name:       name,
		GradeLevel: body.GradeLevel,
		AvatarUrl:  body.AvatarUrl,
		Notes:      body.Notes,
		PinHash:    nil,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractStudent(updated))
}

// toContractStudent maps a sqlc store.Student to the generated contract type.
// Both use string ids; nullable columns are *T on each side. The pin hash is an
// internal secret and is never exposed on the contract Student.
func toContractStudent(s store.Student) contracts.Student {
	return contracts.Student{
		Id:         s.ID,
		Name:       s.Name,
		GradeLevel: s.GradeLevel,
		AvatarUrl:  s.AvatarUrl,
		Notes:      s.Notes,
		CreatedAt:  s.CreatedAt,
	}
}
