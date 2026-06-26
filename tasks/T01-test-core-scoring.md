# T01 — Core scoring/pass/breakdown tests (Go)

- **Wave:** 4 · **Module:** tests · **Lang:** Go · **Depends on:** L01, L02, L03

## Owns
- `backend/internal/core/score_test.go`
- `backend/internal/core/pass_test.go`
- `backend/internal/core/breakdown_test.go`

## Steps
1. Table-driven: 14/20→70, boundaries at the 70 bar, empty inputs, per-topic grouping incl. untopiced.

## Acceptance
- [ ] `go test ./internal/core/...` green; edge cases covered.
