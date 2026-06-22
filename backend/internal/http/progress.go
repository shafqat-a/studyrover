package http

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// progressHistoryLimit caps how many of a student's most-recent attempts are
// loaded to build the progress summary. It bounds the work for very active
// students while comfortably covering the history surfaced in the response and
// the window over which mastery and streaks are computed.
const progressHistoryLimit = 200

// GetProgress handles GET /progress?studentId=...: a student's aggregated
// progress summary — per-topic mastery, the current consecutive-pass streak,
// and recent attempt history (CONTRACTS.md §C12, Progress). It deliberately
// surfaces no internet-time or reward fields: Guardian is off in Phase 1.
//
// Access is parent-or-owning-student: a parent may read any student's progress
// (and must scope it with the studentId query parameter), while a student may
// only read their own and the filter defaults to their own id.
//
// Mastery is folded over the graded attempts oldest-first via core.UpdateMastery
// (an exponential moving average of each topic's correct ratio) and exposed as a
// whole percentage. The streak is computed by core.ComputeStreak over the same
// attempts. History is the recent attempts, newest first.
func (h *Handlers) GetProgress(w http.ResponseWriter, r *http.Request, params contracts.GetProgressParams) {
	var studentID string
	if param := params.StudentId; param != nil {
		studentID = strings.TrimSpace(*param)
	}

	if student, ok := auth.StudentFromCtx(r.Context()); ok {
		// A student may only read their own progress. Default the filter to their
		// own id and reject any attempt to read another student's progress.
		if studentID == "" {
			studentID = student.ID
		}
		if studentID != student.ID {
			unauthorized(w)
			return
		}
	} else if _, ok := auth.ParentFromCtx(r.Context()); ok {
		// A parent must scope the summary to a specific student.
		if studentID == "" {
			badRequest(w, "studentId is required")
			return
		}
	} else {
		unauthorized(w)
		return
	}

	// Load the student's most-recent attempts (newest first). This drives both
	// the history list and the derived mastery/streak aggregates.
	rows, err := h.Store.ListByStudent(r.Context(), store.ListByStudentParams{
		StudentID: studentID,
		Limit:     progressHistoryLimit,
		Offset:    0,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}

	// History: the attempt summaries, newest first (the store orders by
	// started_at DESC). Answers and per-topic detail are reached via the
	// dedicated attempt/result endpoints, not here.
	history := make([]contracts.ExamAttempt, 0, len(rows))
	for i := range rows {
		history = append(history, toContractAttemptSummary(rows[i]))
	}

	// Mastery: fold the graded per-topic results oldest-first so the EMA trends
	// toward recent performance. rows are newest-first, so walk them in reverse.
	var mastery []core.TopicMastery
	for i := len(rows) - 1; i >= 0; i-- {
		perTopic, err := decodePerTopic(rows[i].PerTopic)
		if err != nil {
			internalError(w, err.Error())
			return
		}
		if len(perTopic) == 0 {
			continue
		}
		mastery = core.UpdateMastery(mastery, perTopic, 0)
	}

	// Streak: consecutive-pass days over the full loaded history. The attempts
	// were already converted for the response; reuse them so the streak reflects
	// exactly the surfaced pass/fail and timestamps.
	streak, _ := core.ComputeStreak(history, core.SystemClock.Now(), nil)

	writeJSON(w, http.StatusOK, contracts.Progress{
		StudentId: studentID,
		Mastery:   toContractMastery(mastery),
		Streak:    streak,
		History:   history,
	})
}

// decodePerTopic decodes a stored per_topic JSON blob into typed per-topic
// scores. An empty blob (ungraded attempt) decodes to no scores.
func decodePerTopic(raw []byte) ([]contracts.PerTopicScore, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	var perTopic []contracts.PerTopicScore
	if err := json.Unmarshal(raw, &perTopic); err != nil {
		return nil, err
	}
	return perTopic, nil
}

// toContractMastery converts core mastery estimates (a ratio in [0,1]) into the
// contract TopicMastery shape, exposing mastery as a whole percentage rounded to
// the nearest integer and clamped to [0,100].
func toContractMastery(in []core.TopicMastery) []contracts.TopicMastery {
	out := make([]contracts.TopicMastery, 0, len(in))
	for _, tm := range in {
		pct := int(math.Round(tm.Mastery * 100))
		if pct < 0 {
			pct = 0
		}
		if pct > 100 {
			pct = 100
		}
		out = append(out, contracts.TopicMastery{
			TopicId: tm.TopicID,
			Mastery: pct,
		})
	}
	return out
}
