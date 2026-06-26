package core

import (
	"github.com/shafqat/studyrover/backend/internal/contracts"
	"github.com/shafqat/studyrover/backend/internal/knowledge"
)

// ComposeStudyGuide normalizes a study guide produced by the knowledge backend
// (the internal knowledge.StudyGuide domain shape) into the wire-facing
// contracts.StudyGuide returned to clients (2-C02).
//
// The backend output carries only the grounded content: the markdown body, the
// subject/topic scope, and the supporting citations. It has no persistence
// identity, so the caller supplies the server-assigned id and a Clock for the
// generatedAt timestamp; keeping "now" injected makes the function pure and its
// output reproducible in tests (no time.Now call here).
//
// Normalization rules:
//   - Markdown is carried through verbatim.
//   - SubjectID becomes SubjectId. An empty raw.TopicID maps to a nil TopicId
//     (a whole-subject guide), otherwise the topic is preserved as a pointer.
//   - Citations are mapped one-for-one and in order from knowledge.Citation to
//     contracts.Citation. A citation's Locator is optional on the wire: an empty
//     Locator becomes nil rather than a pointer to "". The resulting slice is
//     always non-nil (empty when there are no citations) so the JSON encodes the
//     required "citations" field as [] rather than null.
//
// ComposeStudyGuide is pure: it allocates fresh output and mutates neither raw
// nor clock.
func ComposeStudyGuide(raw knowledge.StudyGuide, id string, clock Clock) contracts.StudyGuide {
	guide := contracts.StudyGuide{
		Id:          id,
		SubjectId:   raw.SubjectID,
		Markdown:    raw.Markdown,
		GeneratedAt: clock.Now(),
		Citations:   composeCitations(raw.Citations),
	}

	if raw.TopicID != "" {
		topic := raw.TopicID
		guide.TopicId = &topic
	}

	return guide
}

// composeCitations maps internal knowledge citations onto the wire shape,
// preserving order. The returned slice is non-nil even when src is empty so the
// required "citations" field encodes as [].
func composeCitations(src []knowledge.Citation) []contracts.Citation {
	out := make([]contracts.Citation, 0, len(src))
	for _, c := range src {
		cit := contracts.Citation{
			SourceId: c.SourceID,
			Label:    c.Label,
		}
		if c.Locator != "" {
			locator := c.Locator
			cit.Locator = &locator
		}
		out = append(out, cit)
	}
	return out
}
