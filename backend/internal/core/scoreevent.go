package core

import (
	"time"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// BuildScoreEvent assembles the immutable ScoreEvent (CONTRACTS C10) emitted on
// exam submission and consumed only by the Phase 3 Guardian. It maps the graded
// attempt's score, pass flag and per-topic breakdown together with the exam's
// subject, scope and size, and stamps the event with now.
//
// Graded fields on the attempt (ScorePct, Passed, PerTopic) are optional
// pointers; absent values map to their zero value (0, false, empty slice).
// ScopeTopicIds mirrors def.ScopeTopicIds (empty = whole subject). The event
// carries NO minutes/reward/time fields — those are Guardian-only.
//
// BuildScoreEvent is pure: it copies its inputs and mutates nothing. Slice
// fields are always non-nil so the JSON encodes [] rather than null.
func BuildScoreEvent(a contracts.ExamAttempt, def contracts.ExamDefinition, now time.Time) contracts.ScoreEvent {
	scorePct := 0
	if a.ScorePct != nil {
		scorePct = *a.ScorePct
	}
	passed := false
	if a.Passed != nil {
		passed = *a.Passed
	}

	perTopic := []contracts.PerTopicScore{}
	if a.PerTopic != nil {
		perTopic = append(perTopic, (*a.PerTopic)...)
	}

	scope := []string{}
	scope = append(scope, def.ScopeTopicIds...)

	return contracts.ScoreEvent{
		AttemptId:        a.Id,
		StudentId:        a.StudentId,
		SubjectId:        def.SubjectId,
		ExamDefinitionId: def.Id,
		ScopeTopicIds:    scope,
		Size:             def.Size,
		ScorePct:         scorePct,
		Passed:           passed,
		PerTopic:         perTopic,
		Timestamp:        now,
	}
}
