# 2-L03 — Question-draft validator

- **Wave:** 2-core · **Module:** core · **Lang:** Go · **Depends on:** 2-C05

## Owns
- `backend/internal/core/draftvalidator.go`

## Steps
1. `ValidateDraft(d QuestionDraft) error` — ≥4 options, valid `correctOptionIndex`, non-empty text, dedupe options. Drop/flag bad generated drafts before review.

## Acceptance
- [ ] Rejects malformed drafts; keeps the bank trustworthy. Covered by 2-T02.
