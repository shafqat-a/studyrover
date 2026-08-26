package http

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ListLessons handles GET /subjects/{id}/lessons: every lesson of the subject
// in syllabus (topic) order with its resources. Parents see all lessons; a
// student session sees only published ones. 404 when the subject is missing.
func (h *Handlers) ListLessons(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if !sessionPresent(r) {
		unauthorized(w)
		return
	}

	if _, err := h.Store.GetSubject(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	var (
		lessons []store.Lesson
		err     error
	)
	if studentOnlySession(r) {
		lessons, err = h.Store.ListPublishedLessonsBySubject(r.Context(), id)
	} else {
		lessons, err = h.Store.ListLessonsBySubject(r.Context(), id)
	}
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// One round trip for every resource in the subject, grouped by lesson; the
	// query already orders by (lesson_id, position).
	resources, err := h.Store.ListLessonResourcesBySubject(r.Context(), id)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	byLesson := make(map[string][]store.LessonResource, len(lessons))
	for i := range resources {
		byLesson[resources[i].LessonID] = append(byLesson[resources[i].LessonID], resources[i])
	}

	out := make([]contracts.Lesson, 0, len(lessons))
	for i := range lessons {
		out = append(out, toContractLesson(lessons[i], byLesson[lessons[i].ID]))
	}
	writeJSON(w, http.StatusOK, out)
}

// CreateLesson handles POST /subjects/{id}/lessons: creates the (single)
// lesson for a topic of the subject, generating its body synchronously with
// the knowledge backend unless generate=false. The title defaults to the topic
// name. 400 when the topic belongs to another subject, 404 when subject/topic
// are missing, 409 when the topic already has a lesson, and a 502 Problem
// (code INTERNAL, "generation failed") when the backend fails — in which case
// nothing is stored. Parent-guarded.
func (h *Handlers) CreateLesson(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.CreateLesson
	if !decodeJSON(w, r, &body) {
		return
	}
	topicID := strings.TrimSpace(body.TopicId)
	if topicID == "" {
		badRequest(w, "topicId is required")
		return
	}

	subject, err := h.Store.GetSubject(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	topic, err := h.Store.GetTopic(r.Context(), topicID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "topic not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	if topic.SubjectID != id {
		badRequest(w, "topic does not belong to subject")
		return
	}

	// One lesson per topic (topic_id is UNIQUE): check first so the caller gets
	// a clean 409 rather than a constraint error.
	if _, err := h.Store.GetLessonByTopic(r.Context(), topicID); err == nil {
		conflict(w, "the topic already has a lesson")
		return
	} else if !errors.Is(err, pgx.ErrNoRows) {
		internalError(w, err.Error())
		return
	}

	title := topic.Name
	if body.Title != nil {
		if t := strings.TrimSpace(*body.Title); t != "" {
			title = t
		}
	}

	params := store.CreateLessonParams{
		SubjectID: id,
		TopicID:   topicID,
		Title:     title,
		Status:    string(contracts.Draft),
	}

	generate := body.Generate == nil || *body.Generate
	if generate && h.Knowledge != nil {
		markdown, err := h.generateLessonBody(r.Context(), subject, topic, optStr(body.Instructions))
		if err != nil {
			writeProblem(w, http.StatusBadGateway, contracts.INTERNAL, "generation failed", err.Error())
			return
		}
		params.Markdown = markdown
		params.GeneratedAt = pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true}
	}

	created, err := h.Store.CreateLesson(r.Context(), params)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	writeJSON(w, http.StatusCreated, toContractLesson(created, nil))
}

// GetLesson handles GET /lessons/{id}: the lesson with its resources. A student
// session gets a 404 for a draft lesson, exactly as if it did not exist.
func (h *Handlers) GetLesson(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if !sessionPresent(r) {
		unauthorized(w)
		return
	}
	lesson, ok := h.loadLesson(w, r, id)
	if !ok {
		return
	}
	if !lessonVisibleTo(r, lesson) {
		notFound(w, "lesson not found")
		return
	}
	h.writeLesson(w, r, http.StatusOK, lesson)
}

// UpdateLesson handles PUT /lessons/{id}: a partial update of title, markdown
// and status. Absent fields are left untouched; a present title must be
// non-empty and a present status must be draft|published. Parent-guarded.
func (h *Handlers) UpdateLesson(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.UpdateLesson
	if !decodeJSON(w, r, &body) {
		return
	}

	params := store.UpdateLessonParams{ID: id}
	if body.Title != nil {
		t := strings.TrimSpace(*body.Title)
		if t == "" {
			badRequest(w, "title must not be empty")
			return
		}
		params.Title = &t
	}
	if body.Markdown != nil {
		params.Markdown = body.Markdown
	}
	if body.Status != nil {
		if !body.Status.Valid() {
			badRequest(w, "status must be draft or published")
			return
		}
		s := string(*body.Status)
		params.Status = &s
	}

	updated, err := h.Store.UpdateLesson(r.Context(), params)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "lesson not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	h.writeLesson(w, r, http.StatusOK, updated)
}

// DeleteLesson handles DELETE /lessons/{id}: removes the lesson; its resources
// cascade. 404 when it does not exist, 204 on success. Parent-guarded.
func (h *Handlers) DeleteLesson(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	n, err := h.Store.DeleteLesson(r.Context(), id)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	if n == 0 {
		notFound(w, "lesson not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// optStr dereferences an optional string, trimming it; nil → "".
func optStr(p *string) string {
	if p == nil {
		return ""
	}
	return strings.TrimSpace(*p)
}
