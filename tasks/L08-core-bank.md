# L08 — SelectFromBank

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C05

## Owns
- `backend/internal/core/bank.go`

## Steps
1. `func SelectFromBank(pool []Question, n int, recentlyUsed map[string]bool, rng RNG) []Question`.
2. Prefer not-recently-used (rotating bank, spec §6); if pool < n, allow reuse. Shuffle with rng.

## Acceptance
- [ ] Avoids recent when possible; deterministic with seed. Covered by T02.
