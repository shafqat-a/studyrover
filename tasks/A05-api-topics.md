# A05 — GET/POST /topics

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D03, F09

## Owns
- `backend/internal/http/topics.go`

## Steps
1. `TopicsList` (`?subjectId`, ordered by `order`), `TopicCreate` (validate; default order = append).

## Acceptance
- [ ] List ordered; create appends. Parent-guarded.
