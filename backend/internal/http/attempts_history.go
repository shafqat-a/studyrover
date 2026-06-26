package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// ListAttempts handles GET /attempts?studentId=...: a paginated history of a
// single student's exam attempts as summaries (id, examDefinitionId, scorePct,
// passed, submittedAt, status), newest first (CONTRACTS.md §C06). It feeds the
// student's result history (A21).
//
// Access is parent-or-owning-student: a parent may query any student's history,
// while a student may only read their own attempts. The studentId query
// parameter is required for parents; for a student session it defaults to (and
// must match) their own id.
func (h *Handlers) ListAttempts(w http.ResponseWriter, r *http.Request, params contracts.ListAttemptsParams) {
	var studentID string
	if param := params.StudentId; param != nil {
		studentID = strings.TrimSpace(*param)
	}

	if student, ok := auth.StudentFromCtx(r.Context()); ok {
		// A student may only read their own history. Default the filter to their
		// own id and reject any attempt to read another student's attempts.
		if studentID == "" {
			studentID = student.ID
		}
		if studentID != student.ID {
			unauthorized(w)
			return
		}
	} else if _, ok := auth.ParentFromCtx(r.Context()); ok {
		// A parent must scope the history to a specific student.
		if studentID == "" {
			badRequest(w, "studentId is required")
			return
		}
	} else {
		unauthorized(w)
		return
	}

	page, pageSize, limit, offset := pagination(r)

	rows, err := h.Store.ListByStudent(r.Context(), store.ListByStudentParams{
		StudentID: studentID,
		Limit:     int32(limit),
		Offset:    int32(offset),
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	total, err := h.Store.CountByStudent(r.Context(), studentID)
	if err != nil {
		internalError(w, err.Error())
		return
	}

	items := make([]contracts.ExamAttempt, 0, len(rows))
	for i := range rows {
		items = append(items, toContractAttemptSummary(rows[i]))
	}

	writeJSON(w, http.StatusOK, contracts.PageOfExamAttempt{
		Items:    items,
		Total:    int(total),
		Page:     page,
		PageSize: pageSize,
	})
}

// toContractAttemptSummary maps a store.ExamAttempt to the contract ExamAttempt
// for the history list. It surfaces the summary fields (id, examDefinitionId,
// scorePct, passed, submittedAt, status, startedAt) and deliberately omits the
// per-question answers and per-topic breakdown, which are only revealed via the
// dedicated result endpoint. Nullable graded columns are surfaced as pointers.
func toContractAttemptSummary(a store.ExamAttempt) contracts.ExamAttempt {
	out := contracts.ExamAttempt{
		Id:               a.ID,
		ExamDefinitionId: a.ExamDefinitionID,
		StudentId:        a.StudentID,
		Status:           contracts.AttemptStatus(a.Status),
		QuestionIds:      append([]string(nil), a.QuestionIds...),
		StartedAt:        a.StartedAt,
		Answers:          []contracts.Answer{},
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

	return out
}
