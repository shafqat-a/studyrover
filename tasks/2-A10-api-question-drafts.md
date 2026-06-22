# 2-A10 — GET /questions/drafts · approve/reject

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D06, D05, D06(P1), F09

## Owns
- `backend/internal/http/question_drafts.go`

## Steps
1. `DraftsList` (`?subjectId&status`); `DraftApprove` → create real Question+Options (Phase-1 D05/D06) from the draft, mark approved; `DraftReject` → mark rejected.

## Acceptance
- [ ] Approve produces a live, valid Question; reject excludes it. Parent-guarded. Covered by 2-T06.
