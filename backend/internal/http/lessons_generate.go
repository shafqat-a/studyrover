package http

import (
	"context"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// GenerateLesson handles POST /lessons/{id}/generate: (re)writes the lesson
// body with the knowledge backend, synchronously, keeping the attached
// resources. The optional body carries parent instructions. A backend failure
// is a 502 Problem (code INTERNAL, "generation failed") and leaves the lesson
// untouched. Parent-guarded.
func (h *Handlers) GenerateLesson(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.GenerateLessonRequest
	if r.Body != nil && r.ContentLength != 0 {
		if !decodeJSON(w, r, &body) {
			return
		}
	}

	lesson, ok := h.loadLesson(w, r, id)
	if !ok {
		return
	}
	topic, err := h.Store.GetTopic(r.Context(), lesson.TopicID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "topic not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	subject, err := h.Store.GetSubject(r.Context(), lesson.SubjectID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	markdown, err := h.generateLessonBody(r.Context(), subject, topic, optStr(body.Instructions))
	if err != nil {
		writeProblem(w, http.StatusBadGateway, contracts.INTERNAL, "generation failed", err.Error())
		return
	}

	updated, err := h.Store.UpdateLesson(r.Context(), store.UpdateLessonParams{
		ID:          id,
		Markdown:    &markdown,
		GeneratedAt: pgtype.Timestamptz{Time: time.Now().UTC(), Valid: true},
	})
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

// generateLessonBody asks the knowledge backend for a class lesson
// (knowledge.GuideStyleLesson) on the topic, passing the human-readable
// subject/topic names, the student's grade level (when a student profile
// exists) and the parent's instructions. It returns the Markdown body; an
// empty body from the backend is treated as a failure so no blank lesson is
// stored.
func (h *Handlers) generateLessonBody(ctx context.Context, subject store.Subject, topic store.Topic, instructions string) (string, error) {
	if h.Knowledge == nil {
		return "", errors.New("knowledge backend not configured")
	}

	grade := ""
	if student, err := h.Store.GetStudent(ctx); err == nil {
		if student.GradeLevel != nil {
			grade = strings.TrimSpace(*student.GradeLevel)
		}
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	guide, err := h.Knowledge.GenerateStudyGuide(ctx, knowledge.GuideRequest{
		SubjectID:    subject.ID,
		TopicID:      topic.ID,
		Style:        knowledge.GuideStyleLesson,
		SubjectName:  subject.Name,
		TopicName:    topic.Name,
		GradeLevel:   grade,
		Instructions: instructions,
	})
	if err != nil {
		return "", err
	}
	markdown := strings.TrimSpace(guide.Markdown)
	if markdown == "" {
		return "", errors.New("the knowledge backend returned an empty lesson")
	}
	return markdown, nil
}
