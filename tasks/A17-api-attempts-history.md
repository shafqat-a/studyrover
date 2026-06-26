# A17 — GET /attempts (history)

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D07, F09

## Owns
- `backend/internal/http/attempts_history.go`

## Steps
1. `AttemptsHistory` (`?studentId&subjectId?`): paginated `PageOfExamAttempt` summary (id, examDefinitionId, scorePct, passed, submittedAt), newest first.

## Acceptance
- [ ] Paginated history; parent or owning-student access. Feeds A21 + result history.
