package http

import (
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/jobs"
)

// maxExamGenTotal caps the total number of questions a single generated exam may
// request, to bound the LLM work per job.
const maxExamGenTotal = 60

// GenerateExam handles POST /exam-definitions/generate: it enqueues an async job
// that authors the requested number of questions per topic from the knowledge
// backend's curriculum knowledge and assembles them into a ready-to-take exam
// pinned to exactly those questions — no ingested sources or curated question
// bank required. Parent-guarded; returns 202 with the Job.
func (h *Handlers) GenerateExam(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.GenerateExamRequest
	if !decodeJSON(w, r, &body) {
		return
	}

	subjectID := strings.TrimSpace(body.SubjectId)
	if subjectID == "" {
		badRequest(w, "subjectId is required")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		badRequest(w, "name is required")
		return
	}
	if len(body.Topics) == 0 {
		badRequest(w, "at least one topic is required")
		return
	}

	// Confirm the subject exists so we fail fast with 404.
	if _, err := h.Store.GetSubject(r.Context(), subjectID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	payload := jobs.ExamGenPayload{
		SubjectID:  subjectID,
		Name:       name,
		PassBar:    body.PassBar,
		Topics:     make([]jobs.ExamGenTopic, 0, len(body.Topics)),
	}
	if body.Difficulty != nil {
		payload.Difficulty = strings.TrimSpace(*body.Difficulty)
	}

	total := 0
	for _, t := range body.Topics {
		topicID := strings.TrimSpace(t.TopicId)
		if topicID == "" || t.Count <= 0 {
			badRequest(w, "each topic requires a topicId and a positive count")
			return
		}
		// Confirm the topic exists and belongs to the subject.
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
		total += t.Count
		payload.Topics = append(payload.Topics, jobs.ExamGenTopic{TopicID: topicID, Count: t.Count})
	}
	if total > maxExamGenTotal {
		badRequest(w, "total questions must not exceed 60")
		return
	}

	sid := subjectID
	job, err := h.Jobs.Enqueue(r.Context(), jobs.EnqueueParams{
		Type:      jobs.TypeExam,
		SubjectID: &sid,
		Payload:   payload,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusAccepted, toContractJob(job))
}
