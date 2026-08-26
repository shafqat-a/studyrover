package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/jobs"
)

const (
	enrichDefaultMaxPerKind = 3
	enrichMaxPerKindLimit   = 10
)

// EnrichLesson handles POST /lessons/{id}/enrich: queues an "enrich" job that
// searches YouTube and/or Wikipedia for the lesson's topic and attaches the
// best matches as resources (deduplicated by URL). The optional body toggles
// providers, caps results per kind (1..10, default 3) and can override the
// search query. Responds 202 with the Job; poll it for an EnrichResult.
// Parent-guarded.
func (h *Handlers) EnrichLesson(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.EnrichLessonRequest
	if r.Body != nil && r.ContentLength != 0 {
		if !decodeJSON(w, r, &body) {
			return
		}
	}

	lesson, ok := h.loadLesson(w, r, id)
	if !ok {
		return
	}

	payload := jobs.EnrichPayload{
		LessonID:   lesson.ID,
		YouTube:    body.Youtube == nil || *body.Youtube,
		Wikipedia:  body.Wikipedia == nil || *body.Wikipedia,
		MaxPerKind: enrichDefaultMaxPerKind,
	}
	if body.MaxPerKind != nil {
		if *body.MaxPerKind < 1 || *body.MaxPerKind > enrichMaxPerKindLimit {
			badRequest(w, "maxPerKind must be between 1 and 10")
			return
		}
		payload.MaxPerKind = *body.MaxPerKind
	}
	if body.Query != nil {
		payload.Query = strings.TrimSpace(*body.Query)
	}
	if !payload.YouTube && !payload.Wikipedia {
		badRequest(w, "at least one of youtube or wikipedia must be enabled")
		return
	}

	if h.Jobs == nil {
		internalError(w, "job queue not configured")
		return
	}
	sid := lesson.SubjectID
	job, err := h.Jobs.Enqueue(r.Context(), jobs.EnqueueParams{
		Type:      jobs.TypeEnrich,
		SubjectID: &sid,
		Payload:   payload,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, toContractJob(job))
}
