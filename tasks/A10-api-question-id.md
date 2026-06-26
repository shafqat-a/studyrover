# A10 — GET/PUT/DELETE /questions/{id}

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D05, D06, F09

## Owns
- `backend/internal/http/questions_id.go`

## Steps
1. `QuestionGet/Update/Delete` (edit text/options/correct/difficulty/`enabled`; cascade options on delete). Re-validate correctness invariant on PUT in a tx. 404 Problem.

## Acceptance
- [ ] Edit/disable/delete; invariant enforced. Parent-guarded.
