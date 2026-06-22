package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/jobs"
)

// defaultGenCount is the number of drafts requested when the body omits count (or
// supplies a non-positive value). It keeps a single request modest so generation
// stays well within the knowledge backend's per-call budget.
const defaultGenCount = 10

// maxGenCount caps a single generation request so a runaway count cannot ask the
// backend for an unbounded number of drafts in one job.
const maxGenCount = 50

// GenerateQuestions handles POST /questions/generate (2-A09): it enqueues an
// asynchronous "questions" job that drafts multiple-choice questions grounded in
// the subject's ingested sources, and returns 202 with the queued Job
// (contract 2-C03/2-C05). The parent then polls GET /jobs/{id} (2-A06) until the
// job is ready; the generated drafts land in the review queue (pending) and are
// fetched via GET /questions/drafts (2-A10).
//
// The heavy lifting (knowledge.GenerateQuestions + per-draft validation +
// persistence) runs in the worker via the question-gen job handler in
// jobs/questiongen_handler.go; this endpoint only validates the request and
// schedules the work.
func (h *Handlers) GenerateQuestions(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body GenerateQuestionsBody
	if !decodeJSON(w, r, &body) {
		return
	}

	subjectID := strings.TrimSpace(body.SubjectId)
	if subjectID == "" {
		badRequest(w, "subjectId is required")
		return
	}

	count := body.Count
	if count <= 0 {
		count = defaultGenCount
	}
	if count > maxGenCount {
		badRequest(w, "count must not exceed 50")
		return
	}

	var topicID string
	if body.TopicId != nil {
		topicID = strings.TrimSpace(*body.TopicId)
	}

	// Confirm the subject exists so we fail fast with 404 rather than enqueueing
	// a job that the worker would only reject later.
	if _, err := h.Store.GetSubject(r.Context(), subjectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// When scoped to a topic, confirm it exists too (and belongs to the subject)
	// so a bad reference surfaces here instead of as a worker failure.
	if topicID != "" {
		topic, err := h.Store.GetTopic(r.Context(), topicID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				notFound(w, "topic not found")
				return
			}
			internalError(w, err.Error())
			return
		}
		if topic.SubjectID != subjectID {
			badRequest(w, "topic does not belong to subject")
			return
		}
	}

	sid := subjectID
	payload := jobs.QuestionGenPayload{
		SubjectID:  subjectID,
		Count:      count,
		Difficulty: strings.TrimSpace(string(body.Difficulty)),
	}
	if topicID != "" {
		payload.TopicID = topicID
	}

	job, err := h.Jobs.Enqueue(r.Context(), jobs.EnqueueParams{
		Type:      jobs.TypeQuestions,
		SubjectID: &sid,
		Payload:   payload,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, toContractJob(job))
}

// GenerateQuestionsBody is the decoded POST /questions/generate request. It
// mirrors the contract GenRequest (2-C05) plus an optional difficulty hint that
// is threaded through to the knowledge backend. A dedicated type lets the handler
// reject unknown fields without depending on the generated request alias.
type GenerateQuestionsBody struct {
	// SubjectId is the subject to draw source material from (required).
	SubjectId string `json:"subjectId"`
	// TopicId optionally narrows generation to a single topic.
	TopicId *string `json:"topicId,omitempty"`
	// Count is the desired number of drafts; non-positive defaults to ten.
	Count int `json:"count"`
	// Difficulty is an optional target difficulty hint ("easy"|"medium"|"hard").
	Difficulty string `json:"difficulty,omitempty"`
}
