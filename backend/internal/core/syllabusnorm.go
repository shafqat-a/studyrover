package core

import "github.com/shafqat/studyrover/backend/internal/contracts"

// NormalizeSyllabus flattens a tree of derived TopicSuggestion nodes (2-C04)
// into an ordered, flat slice of CreateTopic shapes (C03) ready to be persisted.
//
// The tree is walked depth-first in sibling order: each node is emitted before
// its children, so a parent always precedes its descendants. Every emitted
// CreateTopic receives a fresh, monotonically increasing zero-based Order
// reflecting its position in the flattened sequence — the per-sibling Order on
// the input suggestions is intentionally discarded in favour of a single global
// ordering across the whole flattened list. SourceId and the page range carry
// through unchanged.
//
// SubjectId is left empty: the caller (the syllabus-apply handler, 2-A08) owns
// the subject scope and stamps it onto each returned CreateTopic.
//
// NormalizeSyllabus is pure: it reads its input and mutates nothing. A nil or
// empty input yields a non-nil, empty slice.
func NormalizeSyllabus(suggestions []contracts.TopicSuggestion) []contracts.CreateTopic {
	out := make([]contracts.CreateTopic, 0)
	var order int32
	var walk func(nodes []contracts.TopicSuggestion)
	walk = func(nodes []contracts.TopicSuggestion) {
		for _, n := range nodes {
			ord := order
			out = append(out, contracts.CreateTopic{
				Name:      n.Name,
				Order:     &ord,
				SourceId:  copyString(n.SourceId),
				PageStart: copyIntPtr32(n.PageStart),
				PageEnd:   copyIntPtr32(n.PageEnd),
			})
			order++
			if n.Children != nil {
				walk(*n.Children)
			}
		}
	}
	walk(suggestions)
	return out
}

// copyString returns a fresh pointer to the same string value, or nil.
func copyString(s *string) *string {
	if s == nil {
		return nil
	}
	v := *s
	return &v
}

// copyIntPtr32 widens an *int to a fresh *int32, or returns nil.
func copyIntPtr32(p *int) *int32 {
	if p == nil {
		return nil
	}
	v := int32(*p)
	return &v
}
