package core

import (
	"sort"
	"time"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// BuildDashboard aggregates a student's progress into the parent-facing
// contracts.Dashboard (spec 2-C08). It composes the graded exam history, current
// per-topic mastery, a dated mastery timeline, the overall average score, the
// current study streak, and the parent guidance currently steering the tutor.
//
// Inputs:
//
//   - attempts: the student's exam attempts. Graded attempts (those with a
//     ScorePct) contribute to AvgScore; passed attempts drive the streak. The
//     returned History holds every attempt ordered most-recent first.
//   - snapshots: dated per-topic mastery samples. They populate MasteryTimeline
//     verbatim (sorted by date, then topic), and the most recent sample per topic
//     supplies the current Mastery view.
//   - guidance: parent guidance entries, surfaced unchanged.
//
// The Dashboard carries no internet-time / minutes fields: the Guardian is off
// in this phase, so nothing here references screen-time. now anchors the current
// streak; loc gives the calendar boundaries for the streak (defaulting to UTC
// when nil).
//
// BuildDashboard is pure: it reads its inputs and mutates none of them.
func BuildDashboard(
	attempts []contracts.ExamAttempt,
	snapshots []contracts.MasteryTimelinePoint,
	guidance []contracts.Guidance,
	now time.Time,
	loc *time.Location,
) contracts.Dashboard {
	d := contracts.Dashboard{
		Mastery:         currentMastery(snapshots),
		MasteryTimeline: sortedTimeline(snapshots),
		History:         attemptsByRecency(attempts),
		AvgScore:        averageScore(attempts),
		Guidance:        append([]contracts.Guidance{}, guidance...),
	}
	d.Streak, _ = ComputeStreak(attempts, now, loc)
	return d
}

// currentMastery reduces dated samples to the latest mastery per topic. For each
// topic the sample with the greatest date wins; ties keep the later-listed
// sample. The result is ordered by topic id for determinism.
func currentMastery(snapshots []contracts.MasteryTimelinePoint) []contracts.TopicMastery {
	type latest struct {
		date    time.Time
		mastery int
	}
	byTopic := make(map[string]latest)
	for _, s := range snapshots {
		t := s.Date.Time
		if prev, ok := byTopic[s.TopicId]; ok && t.Before(prev.date) {
			continue
		}
		byTopic[s.TopicId] = latest{date: t, mastery: s.Mastery}
	}

	out := make([]contracts.TopicMastery, 0, len(byTopic))
	for topic, l := range byTopic {
		out = append(out, contracts.TopicMastery{TopicId: topic, Mastery: l.mastery})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TopicId < out[j].TopicId })
	return out
}

// sortedTimeline returns a fresh copy of snapshots sorted by date, then topic id,
// so the trend plots deterministically.
func sortedTimeline(snapshots []contracts.MasteryTimelinePoint) []contracts.MasteryTimelinePoint {
	out := make([]contracts.MasteryTimelinePoint, len(snapshots))
	copy(out, snapshots)
	sort.SliceStable(out, func(i, j int) bool {
		ti, tj := out[i].Date.Time, out[j].Date.Time
		if ti.Equal(tj) {
			return out[i].TopicId < out[j].TopicId
		}
		return ti.Before(tj)
	})
	return out
}

// attemptsByRecency returns a fresh copy of attempts ordered most-recent first.
// Recency uses SubmittedAt when present, otherwise StartedAt.
func attemptsByRecency(attempts []contracts.ExamAttempt) []contracts.ExamAttempt {
	out := make([]contracts.ExamAttempt, len(attempts))
	copy(out, attempts)
	at := func(a contracts.ExamAttempt) time.Time {
		if a.SubmittedAt != nil {
			return *a.SubmittedAt
		}
		return a.StartedAt
	}
	sort.SliceStable(out, func(i, j int) bool { return at(out[i]).After(at(out[j])) })
	return out
}

// averageScore returns the rounded mean ScorePct across graded attempts (those
// with a ScorePct set). It is 0 when no attempt has been graded.
func averageScore(attempts []contracts.ExamAttempt) int {
	sum, n := 0, 0
	for _, a := range attempts {
		if a.ScorePct == nil {
			continue
		}
		sum += *a.ScorePct
		n++
	}
	if n == 0 {
		return 0
	}
	return int(float64(sum)/float64(n) + 0.5)
}
