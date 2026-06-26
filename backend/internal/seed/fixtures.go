// Package seed defines the deterministic demo fixtures inserted by the
// `cmd/seed` command. The data mirrors the frozen contract shapes (CONTRACTS.md
// C01/C03/C04/C05/C07/C09) so that a fresh development or end-to-end database
// boots with a working singleton Settings row plus one complete subject →
// topic → questions → gate-exam chain and a demo student.
//
// All identifiers are fixed UUIDs so that re-running the seed is idempotent:
// every insert is keyed on its stable id via ON CONFLICT, so a second run is a
// no-op rather than producing duplicate rows.
package seed

import (
	"fmt"
	"strconv"
)

// Settings holds the C09 singleton Settings defaults (spec §10). The seed
// upserts exactly one row; ResolveSettings (L10) fills any missing field from
// these same defaults at request time.
type Settings struct {
	// ID is the fixed primary key of the singleton row.
	ID string
	// RewardRateMinPerQ is the Guardian-side reward rate (default 3). Stored
	// now, unused until Phase 3.
	RewardRateMinPerQ int
	// DailyCapHours is the Guardian-side daily cap (default 3).
	DailyCapHours int
	// DefaultExamSize is the default number of questions per exam (default 20).
	DefaultExamSize int
	// DefaultPassBar is the default pass threshold percentage (default 70).
	DefaultPassBar int
	// DefaultCooldownMin is the default post-fail cooldown in minutes (default 10).
	DefaultCooldownMin int
	// KnowledgeBackend selects the knowledge backend (default "notebooklm").
	KnowledgeBackend string
	// DifficultyRamp toggles difficulty ramping (default false).
	DifficultyRamp bool
}

// Subject mirrors C01 Subject (the fields the seed populates).
type Subject struct {
	ID          string
	Name        string
	Color       string
	Icon        string
	Description string
	Archived    bool
}

// Topic mirrors C03 Topic.
type Topic struct {
	ID        string
	SubjectID string
	Name      string
	Order     int
	Active    bool
}

// Option mirrors C05 Option.
type Option struct {
	ID   string
	Text string
}

// Question mirrors C05 Question. CorrectOptionID must match one of Options' ids.
type Question struct {
	ID              string
	SubjectID       string
	TopicID         string
	Text            string
	Options         []Option
	CorrectOptionID string
	Difficulty      string
	Enabled         bool
}

// ExamDefinition mirrors C04 ExamDefinition. An empty ScopeTopicIDs means the
// whole subject.
type ExamDefinition struct {
	ID            string
	SubjectID     string
	Name          string
	Type          string
	ScopeTopicIDs []string
	Size          int
	PassBar       int
	CooldownMin   int
	RewardStyle   string
}

// Student mirrors C07 Student.
type Student struct {
	ID         string
	Name       string
	GradeLevel string
	Notes      string
}

// Fixtures is the complete deterministic dataset the seed command inserts.
type Fixtures struct {
	Settings  Settings
	Subject   Subject
	Topic     Topic
	Questions []Question
	Exam      ExamDefinition
	Student   Student
}

// Fixed UUIDs for the demo fixtures. They are stable so the seed is idempotent.
const (
	settingsID  = "singleton"
	subjectID   = "11111111-1111-1111-1111-111111111111"
	topicID     = "22222222-2222-2222-2222-222222222222"
	examID      = "33333333-3333-3333-3333-333333333333"
	studentID   = "44444444-4444-4444-4444-444444444444"
	questionFmt = "55555555-5555-5555-5555-5555%08d"
	optionFmt   = "66666666-66%02d-6666-6666-6666%08d"
)

// demoQuestionCount is the number of demo questions in the bank. The spec
// default exam size is 20; 25 questions give the bank a little slack so
// AssembleExam (L04) has more than `size` to choose from.
const demoQuestionCount = 25

// Default returns the deterministic demo fixtures. All defaults come straight
// from C09 (spec §10): exam size 20, pass bar 70, cooldown 10, reward rate 3,
// daily cap 3.
func Default() Fixtures {
	settings := Settings{
		ID:                 settingsID,
		RewardRateMinPerQ:  3,
		DailyCapHours:      3,
		DefaultExamSize:    20,
		DefaultPassBar:     70,
		DefaultCooldownMin: 10,
		KnowledgeBackend:   "notebooklm",
		DifficultyRamp:     false,
	}

	subject := Subject{
		ID:          subjectID,
		Name:        "Demo Mathematics",
		Color:       "#4f46e5",
		Icon:        "calculator",
		Description: "Seeded demo subject for development and E2E tests.",
		Archived:    false,
	}

	topic := Topic{
		ID:        topicID,
		SubjectID: subject.ID,
		Name:      "Arithmetic Basics",
		Order:     1,
		Active:    true,
	}

	questions := make([]Question, 0, demoQuestionCount)
	difficulties := []string{"easy", "medium", "hard"}
	for i := 0; i < demoQuestionCount; i++ {
		n := i + 1
		// A simple, deterministic, genuinely-correct arithmetic question so
		// the demo exam can actually be passed.
		a := n
		b := n + 1
		sum := a + b
		opts := buildOptions(i, sum)
		questions = append(questions, Question{
			ID:              questionID(n),
			SubjectID:       subject.ID,
			TopicID:         topic.ID,
			Text:            formatQuestionText(a, b),
			Options:         opts,
			CorrectOptionID: opts[0].ID, // option index 0 is the correct sum
			Difficulty:      difficulties[i%len(difficulties)],
			Enabled:         true,
		})
	}

	exam := ExamDefinition{
		ID:            examID,
		SubjectID:     subject.ID,
		Name:          "Demo Gate Exam",
		Type:          "gate",
		ScopeTopicIDs: []string{}, // [] = whole subject
		Size:          20,
		PassBar:       70,
		CooldownMin:   10,
		RewardStyle:   "flat",
	}

	student := Student{
		ID:         studentID,
		Name:       "Demo Student",
		GradeLevel: "5",
		Notes:      "Seeded demo student for development and E2E tests.",
	}

	return Fixtures{
		Settings:  settings,
		Subject:   subject,
		Topic:     topic,
		Questions: questions,
		Exam:      exam,
		Student:   student,
	}
}

// buildOptions returns four options for question index i. The correct sum is
// placed at index 0 (so callers set CorrectOptionID to opts[0].ID); the three
// distractors are nearby values, all distinct.
func buildOptions(i, sum int) []Option {
	values := []int{sum, sum + 1, sum - 1, sum + 2}
	opts := make([]Option, len(values))
	for j, v := range values {
		opts[j] = Option{
			ID:   optionID(i+1, j+1),
			Text: strconv.Itoa(v),
		}
	}
	return opts
}

// questionID returns the stable UUID for question number n (1-based).
func questionID(n int) string {
	return fmt.Sprintf(questionFmt, n)
}

// optionID returns the stable UUID for option o of question q (both 1-based).
func optionID(q, o int) string {
	return fmt.Sprintf(optionFmt, o, q)
}

// formatQuestionText renders the prompt for the a+b question.
func formatQuestionText(a, b int) string {
	return "What is " + strconv.Itoa(a) + " + " + strconv.Itoa(b) + "?"
}
