package http

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/enrich"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// Class lessons: one AI-generated (or hand-written) Markdown lesson per topic,
// with YouTube / Wikipedia / link resources attached by the Enrich job or by
// hand. This file holds the shared pieces — dependencies, authorisation
// helpers and store→contract mappers; the endpoints live in lessons_crud.go,
// lessons_generate.go, lessons_enrich.go and lessons_resources.go.
//
// Authorisation: every write is parent-only; reads accept either role, but a
// student session only ever sees status=published lessons (drafts 404).

// LessonDeps carries the lesson handlers' enrichment-side dependencies.
type LessonDeps struct {
	// WikipediaLang is the edition used for Wikipedia links whose host carries
	// no language ("wikipedia.org/wiki/…"). Empty means "en".
	WikipediaLang string
	// Metadata resolves a title/thumbnail for a pasted YouTube or Wikipedia URL
	// (oEmbed / page summary). Nil uses the public endpoints.
	Metadata *enrich.Metadata
}

// lessonMetadata returns the configured metadata resolver, defaulting to the
// public endpoints so the handlers work without explicit wiring.
func (h *Handlers) lessonMetadata() *enrich.Metadata {
	if h.Lessons != nil && h.Lessons.Metadata != nil {
		return h.Lessons.Metadata
	}
	return enrich.NewMetadata(nil)
}

// lessonWikipediaLang returns the configured default Wikipedia edition.
func (h *Handlers) lessonWikipediaLang() string {
	if h.Lessons != nil && h.Lessons.WikipediaLang != "" {
		return h.Lessons.WikipediaLang
	}
	return "en"
}

// studentOnlySession reports whether the request is authenticated as a
// student and not as a parent — the case where draft lessons must be hidden.
func studentOnlySession(r *http.Request) bool {
	if _, ok := auth.ParentFromCtx(r.Context()); ok {
		return false
	}
	_, ok := auth.StudentFromCtx(r.Context())
	return ok
}

// loadLesson fetches the lesson by id, writing a 404/500 Problem and returning
// ok=false when it cannot. It does not apply the student visibility rule;
// callers that serve students check lessonVisibleTo.
func (h *Handlers) loadLesson(w http.ResponseWriter, r *http.Request, id string) (store.Lesson, bool) {
	l, err := h.Store.GetLesson(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "lesson not found")
			return store.Lesson{}, false
		}
		internalError(w, err.Error())
		return store.Lesson{}, false
	}
	return l, true
}

// lessonVisibleTo reports whether the session may see the lesson: parents see
// everything, students only published lessons.
func lessonVisibleTo(r *http.Request, l store.Lesson) bool {
	return !studentOnlySession(r) || l.Status == string(contracts.Published)
}

// writeLesson loads the lesson's resources and writes the full contract Lesson
// with the given status code.
func (h *Handlers) writeLesson(w http.ResponseWriter, r *http.Request, status int, l store.Lesson) {
	resources, err := h.Store.ListLessonResources(r.Context(), l.ID)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	writeJSON(w, status, toContractLesson(l, resources))
}

// toContractLesson maps a lesson row plus its (already ordered) resources to
// the contract shape. generated_at is optional on the wire.
func toContractLesson(l store.Lesson, resources []store.LessonResource) contracts.Lesson {
	out := contracts.Lesson{
		Id:        l.ID,
		SubjectId: l.SubjectID,
		TopicId:   l.TopicID,
		Title:     l.Title,
		Markdown:  l.Markdown,
		Status:    contracts.LessonStatus(l.Status),
		Resources: make([]contracts.LessonResource, 0, len(resources)),
		CreatedAt: l.CreatedAt,
		UpdatedAt: l.UpdatedAt,
	}
	if l.GeneratedAt.Valid {
		t := l.GeneratedAt.Time
		out.GeneratedAt = &t
	}
	for i := range resources {
		out.Resources = append(out.Resources, toContractLessonResource(resources[i]))
	}
	return out
}

// toContractLessonResource maps a lesson_resource row to the contract shape.
func toContractLessonResource(r store.LessonResource) contracts.LessonResource {
	return contracts.LessonResource{
		Id:           r.ID,
		LessonId:     r.LessonID,
		Kind:         contracts.LessonResourceKind(r.Kind),
		Title:        r.Title,
		Url:          r.Url,
		Description:  r.Description,
		ThumbnailUrl: r.ThumbnailUrl,
		ExternalId:   r.ExternalID,
		Position:     int(r.Position),
		Source:       contracts.LessonResourceSource(r.Source),
		CreatedAt:    r.CreatedAt,
	}
}
