package core

import (
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// FormatCitations maps backend grounding references (knowledge.Citation) to the
// wire-facing contracts.Citation shape and removes duplicates.
//
// Two raw references are considered the same citation when they share the same
// SourceID and Locator (the Label is treated as cosmetic and ignored for
// identity, so differing labels for the same source/location collapse to the
// first one seen). References with an empty SourceID are skipped: a citation must
// point at a source to be useful. Locator is optional on the wire — an empty raw
// Locator yields a nil Locator pointer rather than a pointer to "".
//
// Order is stable: citations appear in the order their first occurrence is
// encountered in raw, making the output deterministic for identical input.
//
// FormatCitations is pure: it reads raw and mutates nothing, always returning a
// non-nil (possibly empty) slice.
func FormatCitations(raw []knowledge.Citation) []contracts.Citation {
	type key struct {
		sourceID string
		locator  string
	}

	seen := make(map[key]struct{}, len(raw))
	out := make([]contracts.Citation, 0, len(raw))

	for _, c := range raw {
		if c.SourceID == "" {
			continue
		}

		k := key{sourceID: c.SourceID, locator: c.Locator}
		if _, dup := seen[k]; dup {
			continue
		}
		seen[k] = struct{}{}

		citation := contracts.Citation{
			SourceId: c.SourceID,
			Label:    c.Label,
		}
		if c.Locator != "" {
			loc := c.Locator
			citation.Locator = &loc
		}

		out = append(out, citation)
	}

	return out
}
