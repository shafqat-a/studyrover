# A06 — GET/PUT/DELETE /topics/{id}

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D03, F09

## Owns
- `backend/internal/http/topics_id.go`

## Steps
1. `TopicGet/TopicUpdate/TopicDelete` (incl. reorder via `order`, toggle `active`). 404 Problem.

## Acceptance
- [ ] Update + reorder + delete. Parent-guarded.
