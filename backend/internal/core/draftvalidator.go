package core

import (
	"errors"
	"fmt"
	"strings"

	"github.com/shafqat/studyrover/backend/internal/contracts"
)

// minDraftOptions is the minimum number of distinct answer options a generated
// question draft must carry to be considered well-formed (spec C05 requires at
// least four).
const minDraftOptions = 4

// Validation errors returned by ValidateDraft. They are sentinel values so that
// callers can branch on the specific defect (e.g. to flag versus drop a draft)
// via errors.Is.
var (
	// ErrDraftEmptyText reports that the draft's question prompt is blank.
	ErrDraftEmptyText = errors.New("draft: question text is empty")
	// ErrDraftEmptyOption reports that one of the draft's options is blank.
	ErrDraftEmptyOption = errors.New("draft: option text is empty")
	// ErrDraftTooFewOptions reports that the draft has fewer than the required
	// number of distinct options.
	ErrDraftTooFewOptions = errors.New("draft: fewer than four distinct options")
	// ErrDraftDuplicateOption reports that two or more options share the same
	// text (after trimming and case-folding).
	ErrDraftDuplicateOption = errors.New("draft: duplicate option text")
	// ErrDraftIndexOutOfRange reports that correctOptionIndex does not point at a
	// real option.
	ErrDraftIndexOutOfRange = errors.New("draft: correctOptionIndex out of range")
)

// ValidateDraft checks that an AI-generated question draft is well-formed before
// it enters the parent-review queue, keeping the §6 anti-gaming bank
// trustworthy. A draft is valid when:
//
//   - its prompt text is non-empty (after trimming),
//   - every option's text is non-empty (after trimming),
//   - no two options collide (compared trimmed and case-insensitively, so
//     "Paris" and " paris " count as duplicates),
//   - it carries at least four distinct options, and
//   - correctOptionIndex is a valid index into the options slice.
//
// On the first defect found it returns a wrapped sentinel error (see the
// Err* values) describing the problem; callers may use errors.Is to decide
// whether to drop or flag the draft. A nil result means the draft is safe to
// surface for review. ValidateDraft is pure: it reads d and mutates nothing.
func ValidateDraft(d contracts.QuestionDraft) error {
	if strings.TrimSpace(d.Text) == "" {
		return ErrDraftEmptyText
	}

	seen := make(map[string]struct{}, len(d.Options))
	distinct := 0
	for i, opt := range d.Options {
		text := strings.TrimSpace(opt.Text)
		if text == "" {
			return fmt.Errorf("option %d: %w", i, ErrDraftEmptyOption)
		}
		key := strings.ToLower(text)
		if _, dup := seen[key]; dup {
			return fmt.Errorf("option %d (%q): %w", i, opt.Text, ErrDraftDuplicateOption)
		}
		seen[key] = struct{}{}
		distinct++
	}

	if distinct < minDraftOptions {
		return fmt.Errorf("have %d, need %d: %w", distinct, minDraftOptions, ErrDraftTooFewOptions)
	}

	if d.CorrectOptionIndex < 0 || d.CorrectOptionIndex >= len(d.Options) {
		return fmt.Errorf("index %d, %d options: %w", d.CorrectOptionIndex, len(d.Options), ErrDraftIndexOutOfRange)
	}

	return nil
}
