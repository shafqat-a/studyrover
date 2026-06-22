# A16 — GET /attempts/{id}/result

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D07, F09

## Owns
- `backend/internal/http/attempts_result.go`

## Steps
1. `AttemptResult`: return graded attempt — score, passed, perTopic, `cooldownUntil`, and per-question correctness (safe to reveal post-submit). 404 if not submitted.

## Acceptance
- [ ] Reveals answers only after submission; includes review data for P14. Student-guarded.
