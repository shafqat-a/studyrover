package http

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// SubmitAttempt handles POST /attempts/{id}/submit: grades a student's answers
// against the server-side answer key, persists the graded attempt and its
// answers, and emits the immutable ScoreEvent (CONTRACTS.md §C06/§C10). This is
// the heart of the exam loop (T05).
//
// The attempt must be in_progress; a second submission of an already-graded
// attempt is rejected with 409 CONFLICT so the loop can never double-count a
// score. Grading is done entirely server-side: the request only carries the
// selected option per question, never whether it was correct. On a failing
// attempt a cooldown is stamped from the exam definition's cooldownMin.
// Student-guarded.
func (h *Handlers) SubmitAttempt(w http.ResponseWriter, r *http.Request, id contracts.IdPath) {
	if _, ok := auth.StudentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	id = strings.TrimSpace(id)
	if id == "" {
		badRequest(w, "id is required")
		return
	}

	var body contracts.SubmitAttempt
	if !decodeJSON(w, r, &body) {
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

	// Double-submit guard: only an in_progress attempt can be graded. A second
	// submit of a graded attempt is a conflict, never a re-grade.
	if attempt.Status != string(contracts.InProgress) {
		conflict(w, "attempt is not in progress")
		return
	}

	def, err := h.Store.GetExamDefinition(r.Context(), attempt.ExamDefinitionID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "exam definition not found")
			return
		}
		internalError(w, err.Error())
		return
	}

	// Load the answer key and topic map for every assembled question. Answers
	// are graded server-side: the key (correct option) and topic never leave the
	// server. Index the student's submitted selections by question id.
	selected := make(map[string]string, len(body.Answers))
	for _, a := range body.Answers {
		selected[a.QuestionId] = a.SelectedOptionId
	}

	key := make(map[string]string, len(attempt.QuestionIds))
	qTopic := make(map[string]string, len(attempt.QuestionIds))
	answers := make([]contracts.Answer, 0, len(attempt.QuestionIds))
	for _, qid := range attempt.QuestionIds {
		q, err := h.Store.GetQuestion(r.Context(), qid)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				notFound(w, "question not found: "+qid)
				return
			}
			internalError(w, err.Error())
			return
		}
		key[qid] = q.CorrectOptionID
		if q.TopicID != nil {
			qTopic[qid] = *q.TopicID
		}

		ans := contracts.Answer{QuestionId: qid}
		if sel, ok := selected[qid]; ok && sel != "" {
			s := sel
			ans.SelectedOptionId = &s
		}
		answers = append(answers, ans)
	}

	// Score → pass → per-topic breakdown. Stamp per-answer correctness so the
	// breakdown and the persisted answers agree.
	_, _, scorePct := core.ScoreAttempt(answers, key)
	for i := range answers {
		correct := answers[i].SelectedOptionId != nil &&
			key[answers[i].QuestionId] == *answers[i].SelectedOptionId
		c := correct
		answers[i].Correct = &c
	}

	passed := core.DidPass(scorePct, int(def.PassBar))
	perTopic := core.PerTopicBreakdown(answers, qTopic)

	now := time.Now().UTC()

	// On a failed attempt a cooldown blocks the next attempt; a pass clears it.
	var cooldown pgtype.Timestamptz
	if !passed {
		cooldown = pgtype.Timestamptz{Time: core.CooldownUntil(now, int(def.CooldownMin)), Valid: true}
	}

	perTopicJSON, err := json.Marshal(perTopic)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	scorePct32 := int32(scorePct)
	passedVal := passed

	// Persist the answers and the graded attempt atomically: either the whole
	// submission lands or none of it does.
	var graded store.ExamAttempt
	err = h.Store.Tx(r.Context(), func(q *store.Queries) error {
		insert := make([]store.InsertAnswersParams, 0, len(answers))
		for i := range answers {
			insert = append(insert, store.InsertAnswersParams{
				AttemptID:        id,
				QuestionID:       answers[i].QuestionId,
				SelectedOptionID: answers[i].SelectedOptionId,
				Correct:          answers[i].Correct,
			})
		}
		if _, err := q.InsertAnswers(r.Context(), insert); err != nil {
			return err
		}

		g, err := q.MarkSubmitted(r.Context(), store.MarkSubmittedParams{
			ID:            id,
			ScorePct:      &scorePct32,
			Passed:        &passedVal,
			PerTopic:      perTopicJSON,
			CooldownUntil: cooldown,
		})
		if err != nil {
			return err
		}
		graded = g
		return nil
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	gradedAttempt, err := toContractAttemptResult(graded, toStoreAnswers(id, answers))
	if err != nil {
		internalError(w, err.Error())
		return
	}

	scoreEvent := core.BuildScoreEvent(gradedAttempt, examDefToContract(def), now)

	writeJSON(w, http.StatusOK, contracts.SubmitAttemptResult{
		Attempt:    gradedAttempt,
		ScoreEvent: scoreEvent,
	})
}

// toStoreAnswers converts the in-memory graded answers into store.Answer rows so
// the shared toContractAttemptResult mapper can render them, mirroring exactly
// what was just persisted without an extra round trip.
func toStoreAnswers(attemptID string, answers []contracts.Answer) []store.Answer {
	out := make([]store.Answer, 0, len(answers))
	for i := range answers {
		out = append(out, store.Answer{
			AttemptID:        attemptID,
			QuestionID:       answers[i].QuestionId,
			SelectedOptionID: answers[i].SelectedOptionId,
			Correct:          answers[i].Correct,
		})
	}
	return out
}
