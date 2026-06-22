# T05 — API integration: exam flow (Go)

- **Wave:** 4 · **Module:** tests · **Lang:** Go · **Depends on:** A13, A15, A16

## Owns
- `backend/internal/http/exam_flow_test.go`

## Reads
- `internal/testutil` (F08 test DB), the chi handler (W02)

## Steps
1. Against a migrated test DB via `httptest`: start (assert no answers leaked) → submit → grade → result.
2. Assert pass/fail per bar, cooldown set on fail + start blocked (409) during cooldown, ScoreEvent shape (C10).

## Acceptance
- [ ] End-to-end API exam loop green incl. anti-gaming cooldown path.
