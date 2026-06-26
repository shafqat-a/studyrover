package core

import (
	"sort"

	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/llm"
)

// BuildTutorPrompt assembles the AI tutor's system prompt (2-L01) by folding the
// subject's syllabus, the student's per-topic mastery, the parent's per-subject
// TutorInstructions (2-C06), and parent Guidance (2-C07) into the versioned tutor
// template (2-F09, llm.RenderTutorSystem).
//
// It is pure and deterministic: given identical inputs it returns byte-identical
// output. Inputs are never mutated. Syllabus topics are rendered in ascending
// Order (ties broken by Name then Id) so a caller passing topics in any order
// gets a stable prompt. Student progress is rendered in the order supplied, with
// each entry's topic resolved to its human-readable name via the syllabus when
// possible (falling back to the topic id). Only guidance that is in scope for the
// prompt — global guidance plus guidance scoped to this subject — is included.
//
// Empty fields (no syllabus, no progress, blank instructions, no guidance) are
// simply omitted from the rendered prompt, keeping the output free of dangling
// labels.
func BuildTutorPrompt(syllabus []contracts.Topic, progress []contracts.TopicMastery, instructions contracts.TutorInstructions, guidance []contracts.Guidance) string {
	return llm.RenderTutorSystem(llm.TutorInput{
		SubjectContext: llm.SubjectContext{
			Syllabus:           outlineFromTopics(syllabus),
			Progress:           progressFromMastery(progress, syllabus),
			CustomInstructions: instructions.CustomInstructions,
			Guidance:           guidanceLines(guidance, instructions.SubjectId),
			TargetLanguage:     deref(instructions.TargetLanguage),
			Tone:               deref(instructions.Tone),
			Difficulty:         difficultyString(instructions.Difficulty),
		},
	})
}

// outlineFromTopics renders the (flat) subject syllabus as an ordered outline,
// sorted deterministically by Order, then Name, then Id. Inactive topics are
// excluded because they are out of scope for tutoring. The input slice is not
// mutated.
func outlineFromTopics(topics []contracts.Topic) []llm.TopicOutline {
	sorted := make([]contracts.Topic, 0, len(topics))
	for _, t := range topics {
		if !t.Active {
			continue
		}
		sorted = append(sorted, t)
	}
	sort.SliceStable(sorted, func(i, j int) bool {
		a, b := sorted[i], sorted[j]
		if a.Order != b.Order {
			return a.Order < b.Order
		}
		if a.Name != b.Name {
			return a.Name < b.Name
		}
		return a.Id < b.Id
	})

	out := make([]llm.TopicOutline, 0, len(sorted))
	for _, t := range sorted {
		out = append(out, llm.TopicOutline{Name: t.Name})
	}
	return out
}

// progressFromMastery maps API-shaped TopicMastery (whole-percentage) to the
// template's TopicProgress, resolving each topic id to its name via the syllabus
// when available. Order is preserved as supplied so the prompt is deterministic.
func progressFromMastery(progress []contracts.TopicMastery, syllabus []contracts.Topic) []llm.TopicProgress {
	names := make(map[string]string, len(syllabus))
	for _, t := range syllabus {
		names[t.Id] = t.Name
	}

	out := make([]llm.TopicProgress, 0, len(progress))
	for _, p := range progress {
		topic := p.TopicId
		if name, ok := names[p.TopicId]; ok && name != "" {
			topic = name
		}
		out = append(out, llm.TopicProgress{Topic: topic, Mastery: p.Mastery})
	}
	return out
}

// guidanceLines selects the guidance that applies to this tutoring context —
// global guidance plus guidance scoped to subjectID — and returns its text in
// the order supplied. Subject-scoped guidance for other subjects is dropped.
func guidanceLines(guidance []contracts.Guidance, subjectID string) []string {
	out := make([]string, 0, len(guidance))
	for _, g := range guidance {
		switch g.Scope {
		case contracts.GuidanceScopeGlobal:
			out = append(out, g.Text)
		case contracts.GuidanceScopeSubject:
			if g.SubjectId != nil && *g.SubjectId == subjectID {
				out = append(out, g.Text)
			}
		}
	}
	return out
}

// difficultyString renders the optional TutorInstructions difficulty enum as a
// plain string, or "" when unset.
func difficultyString(d *contracts.TutorInstructionsDifficulty) string {
	if d == nil {
		return ""
	}
	return string(*d)
}

// deref returns the pointed-to string, or "" when the pointer is nil.
func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
