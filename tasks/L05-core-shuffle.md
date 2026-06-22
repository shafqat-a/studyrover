# L05 — ShuffleOptions

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C05

## Owns
- `backend/internal/core/shuffle.go`

## Steps
1. `func ShuffleOptions(q Question, rng RNG) Question` — Fisher–Yates on options, preserving ids (anti-guessing, spec §6).

## Acceptance
- [ ] Same options, order varies by seed; ids intact. Covered by T02.
