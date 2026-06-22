# 2-A07 — POST /subjects/{id}/syllabus/suggest

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D03, 2-F05, 2-F06

## Owns
- `backend/internal/http/syllabus_suggest.go`
- `backend/internal/jobs/syllabus_handler.go`

## Steps
1. Enqueue a syllabus job; handler calls `knowledge.DeriveSyllabus`; result = `TopicSuggestion[]` on the Job.

## Acceptance
- [ ] Returns Job; result holds suggestions. Covered by 2-T04/06.
