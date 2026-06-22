package http

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// StartAttempt handles POST /attempts (CONTRACTS.md §C06, spec §6): a student
// starts a new attempt at an exam definition. It loads the definition and its
// eligible question bank, enforces the post-failure cooldown, assembles the
// delivered questions (L04 AssembleExam, which scopes/selects/shuffles and
// strips the answer key), persists the in_progress ExamAttempt with the
// assembled question ids, and returns the attempt plus the delivered questions —
// never the correctOptionId, so the answer key never leaves the server.
//
// Student-guarded: the RequireStudent middleware mounted by the router guards the
// route; the context check here keeps the handler safe in isolation and
// satisfies the "unauthed -> 401" acceptance.
func (h *Handlers) StartAttempt(w http.ResponseWriter, r *http.Request) {
	if _, ok := auth.StudentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var body contracts.StartAttempt
	if !decodeJSON(w, r, &body) {
		return
	}

	body.ExamDefinitionId = strings.TrimSpace(body.ExamDefinitionId)
	if body.ExamDefinitionId == "" {
		badRequest(w, "examDefinitionId is required")
		return
	}
	body.StudentId = strings.TrimSpace(body.StudentId)
	if body.StudentId == "" {
		badRequest(w, "studentId is required")
		return
	}

	// 1. Load the exam definition.
	def, err := h.Store.GetExamDefinition(r.Context(), body.ExamDefinitionId)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			notFound(w, "exam definition not found")
			return
		}
		internalError(w, err.Error())
		return
	}
	contractDef := examDefToContract(def)

	// 2. Cooldown: if the student's most recent attempt at this exam failed and
	// its cooldown window is still active, block with 409 CONFLICT carrying the
	// cooldownUntil instant.
	last, err := h.Store.GetLastFailedForExam(r.Context(), store.GetLastFailedForExamParams{
		ExamDefinitionID: body.ExamDefinitionId,
		StudentID:        body.StudentId,
	})
	switch {
	case err == nil:
		if last.CooldownUntil.Valid && core.IsInCooldown(last.CooldownUntil.Time, time.Now()) {
			conflict(w, "exam is in cooldown until "+last.CooldownUntil.Time.UTC().Format(time.RFC3339))
			return
		}
	case errors.Is(err, pgx.ErrNoRows):
		// No prior failed attempt: nothing to cool down.
	default:
		internalError(w, err.Error())
		return
	}

	// 3. Load the eligible question bank for the subject (enabled questions).
	// AssembleExam applies the def's topic scope, selection (size) and option
	// shuffling, so the whole-subject bank is passed and scoped in core.
	rows, err := h.Store.ListEligibleForExam(r.Context(), store.ListEligibleForExamParams{
		SubjectID:     def.SubjectID,
		ScopeTopicIds: nil,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	bank := make([]contracts.Question, 0, len(rows))
	for i := range rows {
		opts, err := h.Store.ListOptionsByQuestion(r.Context(), rows[i].ID)
		if err != nil {
			internalError(w, err.Error())
			return
		}
		bank = append(bank, toContractQuestion(rows[i], opts))
	}

	// 4. Assemble the delivered questions (scoped, selected, shuffled, no key).
	delivered := core.AssembleExam(contractDef, bank, core.NewRNG())

	questionIDs := make([]string, 0, len(delivered))
	for i := range delivered {
		questionIDs = append(questionIDs, delivered[i].Id)
	}

	// 5. Persist the in_progress attempt with the assembled question ids.
	created, err := h.Store.CreateAttempt(r.Context(), store.CreateAttemptParams{
		ExamDefinitionID: body.ExamDefinitionId,
		StudentID:        body.StudentId,
		QuestionIds:      questionIDs,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	writeJSON(w, http.StatusCreated, contracts.StartAttemptResult{
		Attempt:   toContractAttempt(created),
		Questions: delivered,
	})
}

// toContractAttempt maps a sqlc store.ExamAttempt to the generated contract
// type. String ids on both sides; nullable graded fields are *T / pgtype on the
// store side and *T on the contract side. A freshly-created attempt is
// in_progress with no answers or graded fields.
func toContractAttempt(a store.ExamAttempt) contracts.ExamAttempt {
	questionIDs := a.QuestionIds
	if questionIDs == nil {
		questionIDs = []string{}
	}

	out := contracts.ExamAttempt{
		Id:               a.ID,
		ExamDefinitionId: a.ExamDefinitionID,
		StudentId:        a.StudentID,
		Status:           contracts.AttemptStatus(a.Status),
		QuestionIds:      questionIDs,
		Answers:          []contracts.Answer{},
		StartedAt:        a.StartedAt,
	}

	if a.ScorePct != nil {
		v := int(*a.ScorePct)
		out.ScorePct = &v
	}
	out.Passed = a.Passed
	if a.CooldownUntil.Valid {
		t := a.CooldownUntil.Time
		out.CooldownUntil = &t
	}
	if a.SubmittedAt.Valid {
		t := a.SubmittedAt.Time
		out.SubmittedAt = &t
	}

	return out
}
