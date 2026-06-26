package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ListTopics handles GET /topics?subjectId=...: a parent-guarded, paginated list
// of topics scoped to a single subject and ordered by syllabus position
// (PageOfTopic, CONTRACTS.md §C03/§C11). The subjectId query parameter is
// required; without it the request is rejected with a 400 Problem{VALIDATION}.
func (h *Handlers) ListTopics(w http.ResponseWriter, r *http.Request, params contracts.ListTopicsParams) {
	if !hasSession(r) {
		unauthorized(w)
		return
	}

	if params.SubjectId == nil || strings.TrimSpace(*params.SubjectId) == "" {
		badRequest(w, "subjectId is required")
		return
	}
	subjectID := strings.TrimSpace(*params.SubjectId)

	page, pageSize, limit, offset := pagination(r)

	rows, err := h.Store.ListTopicsBySubject(r.Context(), store.ListTopicsBySubjectParams{
		SubjectID:  subjectID,
		PageOffset: int32(offset),
		PageLimit:  int32(limit),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	total, err := h.Store.CountTopicsBySubject(r.Context(), subjectID)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.Topic, 0, len(rows))
	for i := range rows {
		items = append(items, toContractTopic(rows[i]))
	}

	writeJSON(w, http.StatusOK, contracts.PageOfTopic{
		Items:    items,
		Total:    int32(total),
		Page:     int32(page),
		PageSize: int32(pageSize),
	})
}

// CreateTopic handles POST /topics: validates the CreateTopic body and inserts a
// new topic (CONTRACTS.md §C03). When order is omitted the topic is appended to
// the end of the subject's syllabus (order = current topic count). New topics are
// active by default. Parent-guarded.
func (h *Handlers) CreateTopic(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateTopic
	if !decodeJSON(w, r, &body) {
		return
	}

	body.SubjectId = strings.TrimSpace(body.SubjectId)
	if body.SubjectId == "" {
		badRequest(w, "subjectId is required")
		return
	}

	body.Name = strings.TrimSpace(body.Name)
	if body.Name == "" {
		badRequest(w, "name is required")
		return
	}

	if body.PageStart != nil && body.PageEnd != nil && *body.PageEnd < *body.PageStart {
		badRequest(w, "pageEnd must be >= pageStart")
		return
	}

	// Default order = append: position the new topic after every existing topic
	// in the subject when the caller omits an explicit order.
	var order int32
	if body.Order != nil {
		order = *body.Order
	} else {
		count, err := h.Store.CountTopicsBySubject(r.Context(), body.SubjectId)
		if err != nil {
			internalError(w, err.Error())
			return
		}
		order = int32(count)
	}

	created, err := h.Store.CreateTopic(r.Context(), store.CreateTopicParams{
		SubjectID: body.SubjectId,
		Name:      body.Name,
		SourceID:  body.SourceId,
		PageStart: body.PageStart,
		PageEnd:   body.PageEnd,
		SortOrder: order,
		Active:    nil, // COALESCE($7, true): nil -> default active = true
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, toContractTopic(created))
}

// toContractTopic maps a sqlc store.Topic to the generated contract type. Both
// use string ids; nullable columns are *T on each side.
func toContractTopic(t store.Topic) contracts.Topic {
	return contracts.Topic{
		Id:        t.ID,
		SubjectId: t.SubjectID,
		Name:      t.Name,
		SourceId:  t.SourceID,
		PageStart: t.PageStart,
		PageEnd:   t.PageEnd,
		Order:     t.Order,
		Active:    t.Active,
	}
}
