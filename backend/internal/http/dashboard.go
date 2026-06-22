package http

import (
	"net/http"
	"strings"

	openapi_types "github.com/oapi-codegen/runtime/types"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/core"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// dashboardHistoryLimit caps how many of a student's most-recent attempts are
// loaded to build the dashboard. It bounds the work for very active students
// while comfortably covering the surfaced history and the window over which the
// average score and streak are computed.
const dashboardHistoryLimit = 200

// GetDashboard handles GET /dashboard?studentId=...: the parent-facing
// aggregated view of a student's progress (contract 2-C08, Dashboard). It is
// assembled by the 2-L05 aggregator core.BuildDashboard from the student's
// exam history, the dated per-topic mastery snapshots, and the parent guidance
// currently steering the tutor.
//
// The dashboard is a parent surface: only a parent session may read it, and the
// studentId query parameter is required to scope it to a specific student. It
// carries no internet-time / reward fields — the Guardian is off in this phase.
func (h *Handlers) GetDashboard(w http.ResponseWriter, r *http.Request, params contracts.GetDashboardParams) {
	if _, ok := auth.ParentFromCtx(r.Context()); !ok {
		unauthorized(w)
		return
	}

	var studentID string
	if params.StudentId != nil {
		studentID = strings.TrimSpace(*params.StudentId)
	}
	if studentID == "" {
		badRequest(w, "studentId is required")
		return
	}

	// Exam history (newest first per the store ordering) drives the History list
	// and the derived average score and streak.
	attemptRows, err := h.Store.ListByStudent(r.Context(), store.ListByStudentParams{
		StudentID: studentID,
		Limit:     dashboardHistoryLimit,
		Offset:    0,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}
	attempts := make([]contracts.ExamAttempt, 0, len(attemptRows))
	for i := range attemptRows {
		attempts = append(attempts, toContractAttemptSummary(attemptRows[i]))
	}

	// Dated mastery snapshots (oldest first per the store ordering) populate the
	// mastery timeline; the aggregator reduces them to the current mastery view.
	snapRows, err := h.Store.ListSnapshotsByStudent(r.Context(), store.ListSnapshotsByStudentParams{
		StudentID: studentID,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}
	snapshots := make([]contracts.MasteryTimelinePoint, 0, len(snapRows))
	for i := range snapRows {
		snapshots = append(snapshots, toContractTimelinePoint(snapRows[i]))
	}

	// Parent guidance currently steering the tutor (all scopes), surfaced
	// unchanged. Empty filters return every entry, newest first.
	guidanceRows, err := h.Store.ListGuidance(r.Context(), store.ListGuidanceParams{})
	if err != nil {
		internalError(w, err.Error())
		return
	}
	guidance := make([]contracts.Guidance, 0, len(guidanceRows))
	for i := range guidanceRows {
		guidance = append(guidance, toContractGuidance(guidanceRows[i]))
	}

	dashboard := core.BuildDashboard(attempts, snapshots, guidance, core.SystemClock.Now(), nil)

	writeJSON(w, http.StatusOK, contracts.GetDashboard200JSONResponse(dashboard))
}

// toContractTimelinePoint maps a sqlc store.MasterySnapshot to the contract
// MasteryTimelinePoint used in the dashboard timeline. The stored mastery is a
// ratio in [0,1]; it is exposed as a whole percentage. The sample date is the
// calendar date of the snapshot's capture time.
func toContractTimelinePoint(s store.MasterySnapshot) contracts.MasteryTimelinePoint {
	return contracts.MasteryTimelinePoint{
		Date:    openapi_types.Date{Time: s.CapturedAt},
		TopicId: s.TopicID,
		Mastery: masteryPercent(s.Mastery),
	}
}
