package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// GetAttemptResult handles GET /attempts/{id}/result: returns a graded attempt
// for review (CONTRACTS.md §C06). It reveals per-question correctness, the
// overall score, pass/fail, the per-topic breakdown and any active cooldown —
// data that is only safe to expose once the attempt has been submitted. While
// the attempt is still in_progress the result is treated as not found (404),
// keeping answers hidden until submission. Student-guarded.
func (h *Handlers) GetAttemptResult(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.StudentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	id = strings.TrimSpace(id)
	if id == "" {
		badRequest(w, "id is required")
		return
	}

	attempt, err := h.Store.GetAttempt(r.Context(), id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "attempt not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Results — and the answers they reveal — are only available after the
	// attempt has been submitted and graded. Treat an in_progress attempt as if
	// it has no result yet.
	if attempt.Status != string(contracts.Submitted) {
		notFound(w, "attempt result not available until submitted")
		return
	}

	answers, err := h.Store.ListAnswersByAttempt(r.Context(), id)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	resp, err := toContractAttemptResult(attempt, answers)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, resp)
}

// toContractAttemptResult maps a graded store.ExamAttempt plus its recorded
// answers to the contract ExamAttempt. The per_topic breakdown is stored as a
// JSON blob and decoded into typed PerTopicScore values; nullable graded fields
// (scorePct, passed, cooldownUntil, submittedAt) are surfaced as pointers.
func toContractAttemptResult(a store.ExamAttempt, answers []store.Answer) (contracts.ExamAttempt, error) {
	out := contracts.ExamAttempt{
		Id:               a.ID,
		ExamDefinitionId: a.ExamDefinitionID,
		StudentId:        a.StudentID,
		Status:           contracts.AttemptStatus(a.Status),
		QuestionIds:      append([]string(nil), a.QuestionIds...),
		StartedAt:        a.StartedAt,
		Answers:          toContractAnswers(answers),
	}

	if a.ScorePct != nil {
		v := int(*a.ScorePct)
		out.ScorePct = &v
	}
	if a.Passed != nil {
		v := *a.Passed
		out.Passed = &v
	}
	if a.CooldownUntil.Valid {
		t := a.CooldownUntil.Time
		out.CooldownUntil = &t
	}
	if a.SubmittedAt.Valid {
		t := a.SubmittedAt.Time
		out.SubmittedAt = &t
	}

	if len(a.PerTopic) > 0 {
		var perTopic []contracts.PerTopicScore
		if err := json.Unmarshal(a.PerTopic, &perTopic); err != nil {
			return contracts.ExamAttempt{}, err
		}
		out.PerTopic = &perTopic
	}

	return out, nil
}

// toContractAnswers maps stored answers, including per-question correctness, to
// the contract shape. Correctness is safe to reveal here because the caller has
// confirmed the attempt is submitted.
func toContractAnswers(answers []store.Answer) []contracts.Answer {
	out := make([]contracts.Answer, 0, len(answers))
	for i := range answers {
		out = append(out, contracts.Answer{
			QuestionId:       answers[i].QuestionID,
			SelectedOptionId: answers[i].SelectedOptionID,
			Correct:          answers[i].Correct,
		})
	}
	return out
}
