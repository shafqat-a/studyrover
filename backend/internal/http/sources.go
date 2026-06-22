package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ListSources handles GET /sources?subjectId=...: a parent-guarded, paginated
// list of sources scoped to a single subject (PageOfSource, CONTRACTS.md
// §C02/§C11). The subjectId query parameter is required; without it the request
// is rejected with a 400 Problem{VALIDATION}.
func (h *Handlers) ListSources(w http.ResponseWriter, r *http.Request, params contracts.ListSourcesParams) {
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

	rows, err := h.Store.ListSourcesBySubject(r.Context(), store.ListSourcesBySubjectParams{
		SubjectID: subjectID,
		Limit:     int32(limit),
		Offset:    int32(offset),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	total, err := h.Store.CountSourcesBySubject(r.Context(), subjectID)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Source, 0, len(rows))
	for i := range rows {
		items = append(items, toContractSource(rows[i]))
	}

	writeJSON(w, http.StatusOK, contracts.PageOfSource{
		Items:    items,
		Total:    int(total),
		Page:     page,
		PageSize: pageSize,
	})
}

// CreateSource handles POST /sources: validates the CreateSource body and
// inserts a new source. Phase 1 ingestion is manual, so a `file` source stores
// only its fileRef and every new source is created with status=ready
// (CONTRACTS.md §C02). Parent-guarded.
func (h *Handlers) CreateSource(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateSource
	if !decodeJSON(w, r, &body) {
		return
	}

	body.SubjectId = strings.TrimSpace(body.SubjectId)
	if body.SubjectId == "" {
		badRequest(w, "subjectId is required")
		return
	}

	body.Title = strings.TrimSpace(body.Title)
	if body.Title == "" {
		badRequest(w, "title is required")
		return
	}

	if !validSourceType(body.Type) {
		badRequest(w, "type must be one of: file, notebooklm, text")
		return
	}

	created, err := h.Store.CreateSource(r.Context(), store.CreateSourceParams{
		SubjectID: body.SubjectId,
		Type:      string(body.Type),
		Title:     body.Title,
		Status:    string(contracts.SourceStatusReady),
		FileRef:   body.FileRef,
		Url:       body.Url,
		Text:      body.Text,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, toContractSource(created))
}

// validSourceType reports whether t is one of the contract's SourceType enum
// values (CONTRACTS.md §C02).
func validSourceType(t contracts.SourceType) bool {
	switch t {
	case contracts.SourceTypeFile, contracts.SourceTypeNotebooklm, contracts.SourceTypeText:
		return true
	default:
		return false
	}
}

// toContractSource maps a sqlc store.Source to the generated contract type.
// Both use string ids; nullable columns are *T on each side. The store keeps
// type/status as strings; the contract uses the typed enums.
func toContractSource(s store.Source) contracts.Source {
	return contracts.Source{
		Id:        s.ID,
		SubjectId: s.SubjectID,
		Type:      contracts.SourceType(s.Type),
		Title:     s.Title,
		Status:    contracts.SourceStatus(s.Status),
		FileRef:   s.FileRef,
		Url:       s.Url,
		Text:      s.Text,
		CreatedAt: s.CreatedAt,
	}
}
