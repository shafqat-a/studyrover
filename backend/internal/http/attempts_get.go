package http

import (
	"errors"
	"net/http"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// GetAttempt handles GET /attempts/{id}: returns a student's in-progress exam
// attempt so it can be resumed (CONTRACTS.md §C07). The response carries the
// assembled questionIds in delivery order but never any grading information —
// answers are omitted and the contract's option type has no correctOptionId, so
// the correct answer can never leak before submission.
//
// The route is student-guarded: a student may only read their own attempt. Any
// attempt that does not exist, belongs to another student, or has already been
// submitted is reported as a 404 Problem{NOT_FOUND}. A submitted attempt is
// intentionally surfaced only through the result route (GET /attempts/{id}/result),
// so this resume endpoint hides it rather than disclosing graded fields here.
func (h *Handlers) GetAttempt(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	student, ok := auth.StudentFromCtx(r.Context())
	if !ok {
		unauthorized(w)
		return
	}

	att, err := h.Store.GetAttempt(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "attempt not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Ownership: never reveal the existence of another student's attempt.
	if att.StudentID != student.ID {
		notFound(w, "attempt not found")
		return
	}

	// A submitted attempt is resolved through the result route, not the resume
	// route; treat it as absent here so no graded state is exposed.
	if att.Status != string(contracts.InProgress) {
		notFound(w, "attempt not found")
		return
	}

	// Resume view: question ids in delivery order, no answers, no grading fields.
	resp := contracts.ExamAttempt{
		Id:               att.ID,
		ExamDefinitionId: att.ExamDefinitionID,
		StudentId:        att.StudentID,
		Status:           contracts.AttemptStatus(att.Status),
		QuestionIds:      att.QuestionIds,
		StartedAt:        att.StartedAt,
		Answers:          []contracts.Answer{},
	}

	writeJSON(w, http.StatusOK, resp)
}
