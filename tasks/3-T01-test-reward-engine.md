# 3-T01 — Reward engine unit tests

- **Wave:** 3-tests · **Module:** tests · **Lang:** Go · **Depends on:** 3-R01, 3-R02, 3-R03, 3-R04, 3-R05

## Owns
- `guardian/internal/reward/*_test.go`

## Steps
1. Mapping (flat/scaled, fail→0), diminishing returns monotonicity, daily cap clamp, ramp on/off, full `Decide` composition + ordering.

## Acceptance
- [ ] `go test ./internal/reward/...` green; cap never exceeded.
