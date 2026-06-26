# 3-R01 — score→minutes mapping

- **Wave:** 3-reward · **Module:** reward · **Lang:** Go · **Depends on:** 3-C02, C10

## Owns
- `guardian/internal/reward/mapping.go`

## Steps
1. `MinutesFor(ev ScoreEvent, p RewardPolicy) int` — if `!ev.passed` → 0; flat → `size*rate`; scaled → `round(scorePct% * size*rate)`.

## Acceptance
- [ ] Flat 20q→60; scaled scales with score; fail→0. Pure. Covered by 3-T01.
