package http

import (
	"net/http"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/auth"
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/store"
)

// recentGrantsScan is how many of the student's latest grants are scanned to
// find the most recent source=exam grant (manual overrides may be newer).
const recentGrantsScan = 10

// parentFromReq is auth.ParentFromCtx on the request context.
func parentFromReq(r *http.Request) (auth.Identity, bool) {
	return auth.ParentFromCtx(r.Context())
}

// GetGuardianEarnedTime handles GET /guardian/earned-time (3-A05 / 3-H06):
// the student-facing time summary. A parent may query any student; a student
// only their own id (anything else is 401). When the Guardian is not wired it
// answers enabled=false with zeros so the Phase-1 time slot stays dark.
func (h *Handlers) GetGuardianEarnedTime(w http.ResponseWriter, r *http.Request, params contracts.GetGuardianEarnedTimeParams) {
	studentID := strings.TrimSpace(params.StudentId)
	if _, ok := parentFromReq(r); !ok {
		student, ok := auth.StudentFromCtx(r.Context())
		if !ok || student.ID != studentID {
			unauthorized(w)
			return
		}
	}
	if studentID == "" {
		badRequest(w, "studentId is required")
		return
	}
	if h.Guardian == nil {
		writeJSON(w, http.StatusOK, contracts.EarnedTime{Enabled: false})
		return
	}
	ctx := r.Context()

	policy, _, err := h.effectiveGuardianPolicy(ctx)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	out := contracts.EarnedTime{
		Enabled:    policy.Enabled,
		CapMinutes: policy.DailyCapHours * 60,
	}
	now := h.Guardian.now()

	// Remaining = the longest open grant (the student is online on that device).
	active, err := h.Guardian.Sessions.ActiveForStudent(ctx, studentID)
	if err != nil {
		internalError(w, err.Error())
		return
	}
	var best *store.GuardianGrant
	for i := range active {
		g := &active[i]
		rem := int(g.ExpiresAt.Sub(now).Seconds())
		if rem <= 0 {
			continue
		}
		if rem > out.RemainingSeconds {
			out.RemainingSeconds = rem
			best = g
		}
	}
	if best != nil {
		exp := best.ExpiresAt
		out.ExpiresAt = &exp
		if d, err := h.Store.GetGuardianDevice(ctx, best.DeviceID); err == nil {
			name := d.Name
			out.DeviceName = &name
		}
	}

	today, _ := h.guardianToday()
	usage, err := h.Store.GetGuardianDailyUsage(ctx, store.GetGuardianDailyUsageParams{StudentID: studentID, Day: today})
	if err != nil && !isNoRows(err) {
		internalError(w, err.Error())
		return
	}
	if err == nil {
		out.MinutesToday = int(usage.Minutes)
	}

	// Most recent exam grant (even if expired): the result page shows "you
	// earned N minutes" right after submit.
	recent, err := h.Store.ListRecentGuardianGrantsByStudent(ctx, store.ListRecentGuardianGrantsByStudentParams{
		StudentID: studentID,
		Limit:     recentGrantsScan,
	})
	if err != nil {
		internalError(w, err.Error())
		return
	}
	for _, g := range recent {
		if contracts.GrantSource(g.Source) != contracts.GrantSourceExam {
			continue
		}
		minutes := int(g.Minutes)
		out.LastGrantMinutes = &minutes
		out.LastGrantAttemptId = g.AttemptID
		break
	}

	writeJSON(w, http.StatusOK, out)
}
