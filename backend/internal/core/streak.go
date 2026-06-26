package core

import (
	"sort"
	"time"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// ComputeStreak returns the student's current and longest run of consecutive
// calendar days that contain at least one passed exam attempt (spec §6, visible
// progress). Days are computed in loc so the boundaries follow the student's
// timezone; loc defaults to time.UTC when nil. now anchors the "current" run.
//
// Only submitted, passed attempts count, keyed by the calendar day of their
// SubmittedAt (falling back to StartedAt when SubmittedAt is absent). The
// longest streak is the maximum length of consecutive pass-days anywhere in the
// history. The current streak is the run ending today or yesterday relative to
// now (yesterday still counts as "current" so a streak isn't lost before the day
// is over); if the most recent pass-day is older than yesterday the current
// streak is 0.
//
// ComputeStreak is pure: it does not mutate attempts.
func ComputeStreak(attempts []contracts.ExamAttempt, now time.Time, loc *time.Location) (current, longest int) {
	if loc == nil {
		loc = time.UTC
	}

	// Collect the unique set of calendar days (as day-number since epoch) on
	// which a passed attempt occurred.
	dayOf := func(t time.Time) int {
		y, m, d := t.In(loc).Date()
		return int(time.Date(y, m, d, 0, 0, 0, 0, loc).Unix() / 86400)
	}

	daySet := make(map[int]bool)
	for _, a := range attempts {
		if a.Passed == nil || !*a.Passed {
			continue
		}
		t := a.StartedAt
		if a.SubmittedAt != nil {
			t = *a.SubmittedAt
		}
		daySet[dayOf(t)] = true
	}
	if len(daySet) == 0 {
		return 0, 0
	}

	days := make([]int, 0, len(daySet))
	for d := range daySet {
		days = append(days, d)
	}
	sort.Ints(days)

	// Longest run of consecutive days.
	longest = 1
	run := 1
	for i := 1; i < len(days); i++ {
		if days[i] == days[i-1]+1 {
			run++
		} else {
			run = 1
		}
		if run > longest {
			longest = run
		}
	}

	// Current run: it must end today or yesterday relative to now.
	today := dayOf(now)
	last := days[len(days)-1]
	if last != today && last != today-1 {
		return 0, longest
	}
	current = 1
	for i := len(days) - 1; i > 0; i-- {
		if days[i] == days[i-1]+1 {
			current++
		} else {
			break
		}
	}
	return current, longest
}
