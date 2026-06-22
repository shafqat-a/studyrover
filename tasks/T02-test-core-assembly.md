# T02 — Assembly/shuffle/bank tests (Go)

- **Wave:** 4 · **Module:** tests · **Lang:** Go · **Depends on:** L04, L05, L08

## Owns
- `backend/internal/core/assemble_test.go`
- `backend/internal/core/shuffle_test.go`
- `backend/internal/core/bank_test.go`

## Steps
1. Seeded RNG → deterministic order. Assert no `correctOptionId` leaks; exactly `size`; scope filtering; recently-used avoidance.

## Acceptance
- [ ] Deterministic with seed; answer-leak test present; green.
