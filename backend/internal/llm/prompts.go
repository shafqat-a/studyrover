// Package llm holds the versioned prompt templates that the knowledge backend
// (2-L01 and friends) assembles before calling a model through a
// knowledge.Source adapter. Nothing in this package talks to a network or a
// database: it is pure, deterministic text assembly so it can be unit-tested in
// isolation (2-T02) and reused by any adapter.
//
// Every exported render helper is a pure function of its input struct. Given the
// same input it always produces byte-identical output (template execution is
// deterministic, slices are rendered in the order supplied), which keeps prompt
// output reproducible across runs and easy to snapshot-test.
package llm

import (
	"sort"
	"strings"
	"text/template"
)

// PromptVersion is the schema version of the templates in this file. Bump it
// whenever a template's structure changes so callers can record which prompt
// produced a given artifact and so cached/compared outputs can be invalidated.
const PromptVersion = "p2.v1"

// ----------------------------------------------------------------------------
// Shared input fragments
// ----------------------------------------------------------------------------

// SubjectContext is the common grounding shared by every prompt: what subject we
// are working in, the syllabus, the student's progress, the parent's per-subject
// tutor instructions, and the desired output language/tone. All fields are
// optional except Subject; empty fields are simply omitted from the rendered
// prompt so the result stays deterministic and free of dangling labels.
type SubjectContext struct {
	// Subject is the human-readable subject name (e.g. "Algebra I").
	Subject string

	// Syllabus is the ordered list of topics that scope the subject. Order is
	// preserved exactly as supplied.
	Syllabus []TopicOutline

	// Progress summarises how the student is doing per topic. Order is preserved.
	Progress []TopicProgress

	// CustomInstructions is the parent's free-text per-subject guidance
	// (TutorInstructions.customInstructions, 2-C06).
	CustomInstructions string

	// Guidance is parent-authored guidance that steers tutor behaviour
	// (Guidance.text, 2-C07). Global and subject-scoped guidance are merged by
	// the caller into this ordered list.
	Guidance []string

	// TargetLanguage is an optional BCP-47 tag the model should answer in
	// (e.g. "en", "es"). Empty means "no constraint".
	TargetLanguage string

	// Tone is an optional conversational tone (e.g. "encouraging", "socratic").
	Tone string

	// Difficulty is an optional difficulty level to pitch output at
	// (e.g. "beginner", "intermediate", "advanced").
	Difficulty string
}

// TopicOutline is a single (optionally nested) syllabus entry used to render the
// syllabus block inside a prompt.
type TopicOutline struct {
	Name     string
	Children []TopicOutline
}

// TopicProgress is a per-topic progress summary. Mastery is a 0-100 percentage.
type TopicProgress struct {
	Topic   string
	Mastery int
}

// ----------------------------------------------------------------------------
// Render helpers
// ----------------------------------------------------------------------------

// GuideInput is the input to the study-guide template.
type GuideInput struct {
	SubjectContext

	// Topic, when set, scopes the guide to a single topic; empty means the
	// whole subject.
	Topic string
}

// QuestionInput is the input to the question-generation template.
type QuestionInput struct {
	SubjectContext

	// Topic, when set, scopes generation to a single topic.
	Topic string

	// Count is the number of question drafts to produce. Values below 1 are
	// clamped to 1 by RenderQuestions.
	Count int

	// MinOptions is the minimum number of answer options per question. Values
	// below 4 are clamped to 4 so generated drafts satisfy 2-L03 validation.
	MinOptions int
}

// SyllabusInput is the input to the syllabus-derivation template.
type SyllabusInput struct {
	SubjectContext

	// SourceExcerpt is the (already OCR'd, by the backend) text the syllabus
	// should be derived from. May be empty when deriving from the subject name
	// alone.
	SourceExcerpt string
}

// TutorInput is the input to the tutor system-prompt template.
type TutorInput struct {
	SubjectContext

	// Topic, when set, focuses the current tutoring turn on one topic.
	Topic string
}

// RenderStudyGuide renders the deterministic prompt that asks the model to
// produce a Markdown study guide grounded in the supplied sources.
func RenderStudyGuide(in GuideInput) string {
	return render(studyGuideTmpl, map[string]any{
		"Version": PromptVersion,
		"Scope":   scopeLine(in.Subject, in.Topic),
		"Context": contextBlock(in.SubjectContext),
	})
}

// RenderQuestions renders the deterministic prompt for generating question
// drafts. It always demands at least MinOptions (>= 4) options, exactly one
// correct answer, and a topic tag per question so the resulting drafts pass
// 2-L03 validation (>= 4 options + one correct + topic tag).
func RenderQuestions(in QuestionInput) string {
	count := in.Count
	if count < 1 {
		count = 1
	}
	minOpts := in.MinOptions
	if minOpts < 4 {
		minOpts = 4
	}
	return render(questionsTmpl, map[string]any{
		"Version":    PromptVersion,
		"Scope":      scopeLine(in.Subject, in.Topic),
		"Context":    contextBlock(in.SubjectContext),
		"Count":      count,
		"MinOptions": minOpts,
	})
}

// RenderSyllabus renders the deterministic prompt for deriving a hierarchical
// syllabus (TopicSuggestion[]) from a source excerpt and/or the subject name.
func RenderSyllabus(in SyllabusInput) string {
	excerpt := strings.TrimSpace(in.SourceExcerpt)
	return render(syllabusTmpl, map[string]any{
		"Version": PromptVersion,
		"Subject": strings.TrimSpace(in.Subject),
		"Context": contextBlock(in.SubjectContext),
		"Excerpt": excerpt,
	})
}

// RenderTutorSystem renders the deterministic system prompt for the AI tutor. It
// folds in the syllabus, student progress, per-subject custom instructions,
// parent guidance, and the requested language/tone/difficulty.
func RenderTutorSystem(in TutorInput) string {
	return render(tutorTmpl, map[string]any{
		"Version": PromptVersion,
		"Scope":   scopeLine(in.Subject, in.Topic),
		"Context": contextBlock(in.SubjectContext),
	})
}

// ----------------------------------------------------------------------------
// Internal assembly
// ----------------------------------------------------------------------------

// scopeLine produces the "Subject … (topic …)" header fragment.
func scopeLine(subject, topic string) string {
	subject = strings.TrimSpace(subject)
	topic = strings.TrimSpace(topic)
	if subject == "" {
		subject = "this subject"
	}
	if topic != "" {
		return subject + ", focused on the topic \"" + topic + "\""
	}
	return subject
}

// contextBlock renders the shared grounding (syllabus, progress, instructions,
// guidance, language/tone/difficulty) as a deterministic, label-prefixed block.
// Empty sections are omitted entirely. The returned string has no trailing
// newline.
func contextBlock(c SubjectContext) string {
	var b strings.Builder

	if syl := renderOutline(c.Syllabus, 0); syl != "" {
		b.WriteString("Syllabus:\n")
		b.WriteString(syl)
		b.WriteString("\n")
	}

	if prog := renderProgress(c.Progress); prog != "" {
		b.WriteString("Student progress (mastery 0-100):\n")
		b.WriteString(prog)
		b.WriteString("\n")
	}

	if ci := strings.TrimSpace(c.CustomInstructions); ci != "" {
		b.WriteString("Per-subject instructions from the parent:\n")
		b.WriteString(ci)
		b.WriteString("\n")
	}

	if g := renderGuidance(c.Guidance); g != "" {
		b.WriteString("Parent guidance (must be respected):\n")
		b.WriteString(g)
		b.WriteString("\n")
	}

	prefs := renderPreferences(c)
	if prefs != "" {
		b.WriteString(prefs)
		b.WriteString("\n")
	}

	return strings.TrimRight(b.String(), "\n")
}

// renderOutline renders a (possibly nested) syllabus as an indented bullet list.
func renderOutline(topics []TopicOutline, depth int) string {
	var b strings.Builder
	for _, t := range topics {
		name := strings.TrimSpace(t.Name)
		if name == "" {
			continue
		}
		b.WriteString(strings.Repeat("  ", depth))
		b.WriteString("- ")
		b.WriteString(name)
		b.WriteString("\n")
		if len(t.Children) > 0 {
			b.WriteString(renderOutline(t.Children, depth+1))
		}
	}
	return b.String()
}

// renderProgress renders per-topic mastery as a deterministic bullet list.
func renderProgress(ps []TopicProgress) string {
	var b strings.Builder
	for _, p := range ps {
		topic := strings.TrimSpace(p.Topic)
		if topic == "" {
			continue
		}
		m := p.Mastery
		if m < 0 {
			m = 0
		}
		if m > 100 {
			m = 100
		}
		b.WriteString("- ")
		b.WriteString(topic)
		b.WriteString(": ")
		b.WriteString(itoa(m))
		b.WriteString("\n")
	}
	return b.String()
}

// renderGuidance renders parent guidance lines, skipping blanks.
func renderGuidance(gs []string) string {
	var b strings.Builder
	for _, g := range gs {
		g = strings.TrimSpace(g)
		if g == "" {
			continue
		}
		b.WriteString("- ")
		b.WriteString(g)
		b.WriteString("\n")
	}
	return b.String()
}

// renderPreferences renders the language/tone/difficulty preferences in a fixed
// order so output is deterministic.
func renderPreferences(c SubjectContext) string {
	prefs := make([]string, 0, 3)
	if lang := strings.TrimSpace(c.TargetLanguage); lang != "" {
		prefs = append(prefs, "Respond in language: "+lang+".")
	}
	if tone := strings.TrimSpace(c.Tone); tone != "" {
		prefs = append(prefs, "Use a "+tone+" tone.")
	}
	if diff := strings.TrimSpace(c.Difficulty); diff != "" {
		prefs = append(prefs, "Pitch the difficulty at: "+diff+".")
	}
	// prefs are already in a fixed declaration order; sort defensively to keep
	// output stable even if the order above ever changes.
	sort.Strings(prefs)
	return strings.Join(prefs, "\n")
}

// itoa is a tiny dependency-free integer-to-string (avoids importing strconv for
// a single call site and keeps the package surface minimal).
func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var buf [20]byte
	i := len(buf)
	for n > 0 {
		i--
		buf[i] = byte('0' + n%10)
		n /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// render executes a parsed template against data and returns the trimmed result.
// Templates are pre-parsed at init so render cannot fail at runtime; any parse
// error would have panicked during package initialisation.
func render(t *template.Template, data map[string]any) string {
	var b strings.Builder
	// The error is always nil for these data shapes; ignore it to keep the
	// helpers ergonomic. A buggy template would surface during 2-T02.
	_ = t.Execute(&b, data)
	return strings.TrimSpace(b.String())
}

// ----------------------------------------------------------------------------
// Templates
// ----------------------------------------------------------------------------

// optBlock conditionally renders the shared context block under a heading.
const ctxFragment = `{{if .Context}}

--- Context ---
{{.Context}}{{end}}`

var (
	studyGuideTmpl = template.Must(template.New("study-guide").Parse(
		`[prompt:study-guide v={{.Version}}]
You are an expert tutor writing a study guide for {{.Scope}}.

Write a clear, well-structured study guide in Markdown. Cover the key concepts,
include worked examples where helpful, and finish with a short summary and a few
self-check questions. Ground every claim in the provided sources and do not
invent facts beyond them.` + ctxFragment))

	questionsTmpl = template.Must(template.New("questions").Parse(
		`[prompt:questions v={{.Version}}]
You are generating practice questions for {{.Scope}}.

Generate exactly {{.Count}} multiple-choice question(s). Each question MUST:
- have at least {{.MinOptions}} answer options;
- have exactly one correct option;
- be tagged with the topic it assesses (a "topic" field);
- include a "correctOptionIndex" identifying the single correct option.

Return the questions as a JSON array. Each element MUST have this shape:
{"text": string, "options": [{"text": string}, ...],
 "correctOptionIndex": integer, "topic": string, "difficulty": string}

Ensure the options are plausible and mutually exclusive, and that exactly one is
unambiguously correct. Ground questions in the provided sources.` + ctxFragment))

	syllabusTmpl = template.Must(template.New("syllabus").Parse(
		`[prompt:syllabus v={{.Version}}]
Derive a hierarchical syllabus{{if .Subject}} for the subject "{{.Subject}}"{{end}}.

Produce an ordered list of topics (with optional nested sub-topics) that fully
covers the material. Return a JSON array of TopicSuggestion objects, each shaped:
{"name": string, "order": integer, "pageStart": integer|null,
 "pageEnd": integer|null, "children": TopicSuggestion[]|null}

Use zero-based "order" among siblings. When the source is paginated, set
pageStart/pageEnd to the 1-based page range each topic spans.{{if .Excerpt}}

--- Source excerpt ---
{{.Excerpt}}{{end}}` + ctxFragment))

	tutorTmpl = template.Must(template.New("tutor").Parse(
		`[prompt:tutor-system v={{.Version}}]
You are StudyRover, a patient one-on-one AI tutor for {{.Scope}}.

Guide the student to understanding rather than handing over answers: ask probing
questions, give hints, and build on what they already know. Always cite the
source material you rely on. Never reveal exam answer keys. Stay strictly within
the subject and follow all parent guidance and per-subject instructions
below.` + ctxFragment))
)
