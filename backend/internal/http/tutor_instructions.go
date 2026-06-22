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

// GetTutorInstructions handles GET /subjects/{id}/tutor-instructions: the
// per-subject configuration that steers the AI tutor (contract 2-C06, spec
// §2.7; feeds the 2-L01 prompt assembly). Parent-guarded. When no row has been
// saved yet the subject still exists, so we return a default (empty) set of
// instructions for the subject rather than 404 — the tutor always has a usable
// (if blank) configuration to assemble its prompt from.
func (h *Handlers) GetTutorInstructions(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	// The subject must exist for instructions to be meaningful.
	if _, err := h.Store.GetSubject(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	row, err := h.Store.GetTutorInstructionsBySubject(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// No instructions saved yet: hand back the empty defaults for this
			// subject so callers (and prompt assembly) get a stable shape.
			writeJSON(w, http.StatusOK, contracts.TutorInstructions{SubjectId: id})
			return
		}
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractTutorInstructions(row))
}

// UpdateTutorInstructions handles PUT /subjects/{id}/tutor-instructions:
// upserts the per-subject tutor configuration and returns the stored value
// (contract 2-C06). Parent-guarded. The path id is authoritative for the
// subject; a mismatching body.subjectId is rejected.
func (h *Handlers) UpdateTutorInstructions(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.TutorInstructions
	if !decodeJSON(w, r, &body) {
		return
	}

	if body.SubjectId != "" && body.SubjectId != id {
		badRequest(w, "subjectId in body does not match path")
		return
	}

	if body.Difficulty != nil && !body.Difficulty.Valid() {
		badRequest(w, "difficulty must be one of easy, medium, hard")
		return
	}

	// The subject must exist before we can attach instructions to it.
	if _, err := h.Store.GetSubject(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	row, err := h.Store.UpsertTutorInstructions(r.Context(), store.UpsertTutorInstructionsParams{
		SubjectID:          id,
		CustomInstructions: strings.TrimSpace(body.CustomInstructions),
		Tone:               trimmedPtr(body.Tone),
		TargetLanguage:     trimmedPtr(body.TargetLanguage),
		Difficulty:         difficultyPtr(body.Difficulty),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, toContractTutorInstructions(row))
}

// difficultyPtr converts the contract difficulty enum pointer into the *string
// the store expects, preserving nil.
func difficultyPtr(d *contracts.TutorInstructionsDifficulty) *string {
	if d == nil {
		return nil
	}
	s := string(*d)
	return &s
}

// trimmedPtr trims surrounding whitespace from an optional string, returning
// nil when the input is nil or trims to empty.
func trimmedPtr(s *string) *string {
	if s == nil {
		return nil
	}
	t := strings.TrimSpace(*s)
	if t == "" {
		return nil
	}
	return &t
}
