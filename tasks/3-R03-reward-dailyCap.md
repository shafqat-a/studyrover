# 3-R03 — Daily cap

- **Wave:** 3-reward · **Module:** reward · **Lang:** Go · **Depends on:** 3-C02

## Owns
- `guardian/internal/reward/cap.go`

## Steps
1. `ApplyCap(minutes, usedTodayMin int, p RewardPolicy) int` — clamp so total ≤ `dailyCapHours*60` (spec §10).

## Acceptance
- [ ] Never exceeds cap; returns remaining-limited grant. Pure. Covered by 3-T01.
