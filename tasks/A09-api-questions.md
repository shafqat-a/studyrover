# A09 — GET/POST /questions

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D05, D06, F09

## Owns
- `backend/internal/http/questions.go`

## Steps
1. `QuestionsList` (`?subjectId&topicId`, paginated, full Question with options — parent view).
2. `QuestionCreate`: validate `CreateQuestion` (≥4 options, `correctOptionIndex` in range); insert question + options in a tx; resolve `correctOptionId`.

## Acceptance
- [ ] Rejects <4 options / bad index (400); returns created Question. Parent-guarded.
