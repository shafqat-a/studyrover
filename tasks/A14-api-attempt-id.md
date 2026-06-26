# A14 — GET /attempts/{id}

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D07, F09

## Owns
- `backend/internal/http/attempts_get.go`

## Steps
1. `AttemptGet`: return in-progress attempt + delivered questions (no answers) for resume; if submitted, defer to result route. 404 Problem.

## Acceptance
- [ ] Never leaks `correctOptionId` pre-submit. Student-guarded (own attempt only).
