# 2-A12 — GET/PUT /guidance

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D05, F09

## Owns
- `backend/internal/http/guidance.go`

## Steps
1. `GuidanceList` (`?subjectId`), `GuidanceCreate`, `GuidanceDelete` (global or per-subject). Parent-guarded.

## Acceptance
- [ ] CRUD guidance; feeds 2-L01. Matches 2-C07.
