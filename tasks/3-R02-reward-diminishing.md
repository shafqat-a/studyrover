# 3-R02 — Diminishing returns

- **Wave:** 3-reward · **Module:** reward · **Lang:** Go · **Depends on:** 3-C02

## Owns
- `guardian/internal/reward/diminishing.go`

## Steps
1. `ApplyDiminishing(base int, grantsToday int, p RewardPolicy) int` — Nth pass pays less (e.g. decay factor per prior grant) when enabled (spec §6).

## Acceptance
- [ ] 1st full, later reduced; monotonic non-increasing. Pure. Covered by 3-T01.
