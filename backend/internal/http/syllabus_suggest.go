package http

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/jobs"
)

// SuggestSyllabus handles POST /subjects/{id}/syllabus/suggest (2-A07): it
// enqueues an asynchronous "syllabus" job that derives a suggested topic tree
// from the subject's ingested sources, and returns 202 with the queued Job
// (contract 2-C03/2-C04). The parent then polls GET /jobs/{id} (2-A06) until the
// job is ready, at which point Job.result holds a TopicSuggestion[] that can be
// materialised via POST /subjects/{id}/syllabus/apply (2-A08).
//
// The heavy lifting (knowledge.DeriveSyllabus) runs in the worker via the
// syllabus job handler in jobs/syllabus_handler.go; this endpoint only validates
// the subject exists and schedules the work.
func (h *Handlers) SuggestSyllabus(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	if id == "" {
		badRequest(w, "subject id is required")
		return
	}

	// Confirm the subject exists so we fail fast with 404 rather than enqueueing
	// a job that the worker would only reject later.
	if _, err := h.Store.GetSubject(r.Context(), id); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "subject not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	subjectID := id
	job, err := h.Jobs.Enqueue(r.Context(), jobs.EnqueueParams{
		Type:      jobs.TypeSyllabus,
		SubjectID: &subjectID,
		Payload:   jobs.SyllabusPayload{SubjectID: subjectID},
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// toContractJob (2-A06, jobs.go) maps the queued store.Job to the contract.
	writeJSON(w, http.StatusAccepted, toContractJob(job))
}
