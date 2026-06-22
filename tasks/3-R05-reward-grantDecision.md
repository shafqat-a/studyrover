# 3-R05 — Grant decision (compose)

- **Wave:** 3-reward · **Module:** reward · **Lang:** Go · **Depends on:** 3-R01, 3-R02, 3-R03, 3-R04

## Goal
The full score→minutes policy: the one function the intake pipeline calls. **Lives only in the Guardian.**

## Owns
- `guardian/internal/reward/decision.go`

## Steps
1. `Decide(ev ScoreEvent, usage DailyUsage, p RewardPolicy) (minutes int)` = mapping → ramp → diminishing → cap. 0 when failed/capped.

## Acceptance
- [ ] Correct composition order; respects cap; fail→0. Pure. Covered by 3-T01.
