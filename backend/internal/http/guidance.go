// Parent guidance endpoints (2-A12, CONTRACTS-P2 §2-C07): the free-text
// instructions a parent sets to steer the AI tutor. Guidance is either global
// (applies to every subject) or scoped to a single subject. These entries feed
// the tutor system-prompt assembly (2-L01) and the dashboard (2-A13).
//
// The contract exposes two operations:
//   - GET  /guidance[?subjectId]  → []Guidance
//   - PUT  /guidance              → Guidance (create-or-replace)
//
// PUT carries replace semantics: setting guidance for a scope clears the prior
// entries for that exact scope before inserting the new one, so a parent's
// latest guidance is authoritative rather than accumulating duplicates.
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

// GetGuidance handles GET /guidance: returns parent guidance, newest first.
// With ?subjectId it returns the guidance scoped to that subject; without it,
// the global guidance. The route is parent-guarded; the context check keeps the
// handler safe in isolation (unauthed → 401).
func (h *Handlers) GetGuidance(w http.ResponseWriter, r *http.Request, params contracts.GetGuidanceParams) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var listParams store.ListGuidanceParams
	if params.SubjectId != nil {
		subjectID := strings.TrimSpace(*params.SubjectId)
		if subjectID == "" {
			badRequest(w, "subjectId must not be blank")
			return
		}
		if _, err := h.Store.GetSubject(r.Context(), subjectID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				notFound(w, "subject not found")
				return
			}
			internalError(w, err.Error())
			return
		}
		scope := string(contracts.GuidanceScopeSubject)
		listParams.Scope = &scope
		listParams.SubjectID = &subjectID
	} else {
		scope := string(contracts.GuidanceScopeGlobal)
		listParams.Scope = &scope
	}

	rows, err := h.Store.ListGuidance(r.Context(), listParams)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Guidance, 0, len(rows))
	for i := range rows {
		items = append(items, toContractGuidance(rows[i]))
	}

	writeJSON(w, http.StatusOK, contracts.GetGuidance200JSONResponse(items))
}

// UpdateGuidance handles PUT /guidance: create-or-replace the parent guidance
// for a scope. A "subject" scope requires a valid subjectId; a "global" scope
// must omit it. Existing entries for the same scope are removed first so the new
// guidance is authoritative, then the new entry is inserted and returned.
func (h *Handlers) UpdateGuidance(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateGuidance
	if !decodeJSON(w, r, &body) {
		return
	}

	if !body.Scope.Valid() {
		badRequest(w, "scope must be \"global\" or \"subject\"")
		return
	}

	body.Text = strings.TrimSpace(body.Text)
	if body.Text == "" {
		badRequest(w, "text is required")
		return
	}

	createParams := store.CreateGuidanceParams{
		Scope: string(body.Scope),
		Text:  body.Text,
	}
	listParams := store.ListGuidanceParams{Scope: &createParams.Scope}

	switch body.Scope {
	case contracts.CreateGuidanceScopeSubject:
		if body.SubjectId == nil {
			badRequest(w, "subjectId is required when scope is \"subject\"")
			return
		}
		subjectID := strings.TrimSpace(*body.SubjectId)
		if subjectID == "" {
			badRequest(w, "subjectId must not be blank")
			return
		}
		if _, err := h.Store.GetSubject(r.Context(), subjectID); err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				notFound(w, "subject not found")
				return
			}
			internalError(w, err.Error())
			return
		}
		createParams.SubjectID = &subjectID
		listParams.SubjectID = &subjectID
	case contracts.CreateGuidanceScopeGlobal:
		if body.SubjectId != nil && strings.TrimSpace(*body.SubjectId) != "" {
			badRequest(w, "subjectId must be omitted when scope is \"global\"")
			return
		}
	}

	// Replace prior guidance for this exact scope so the latest entry is
	// authoritative rather than accumulating duplicates.
	existing, err := h.Store.ListGuidance(r.Context(), listParams)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	for i := range existing {
		if err := h.Store.DeleteGuidance(r.Context(), existing[i].ID); err != nil {
			internalError(w, err.Error())
			return
		}
	}

	created, err := h.Store.CreateGuidance(r.Context(), createParams)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, contracts.UpdateGuidance200JSONResponse(toContractGuidance(created)))
}

// toContractGuidance maps a sqlc store.Guidance to the generated contract type.
// Both use string ids; subjectId is nullable (*string) on each side.
func toContractGuidance(g store.Guidance) contracts.Guidance {
	return contracts.Guidance{
		Id:        g.ID,
		Scope:     contracts.GuidanceScope(g.Scope),
		SubjectId: g.SubjectID,
		Text:      g.Text,
		CreatedAt: g.CreatedAt,
	}
}
