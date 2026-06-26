# 3-R04 — Reward/difficulty ramp (optional)

- **Wave:** 3-reward · **Module:** reward · **Lang:** Go · **Depends on:** 3-C02

## Owns
- `guardian/internal/reward/ramp.go`

## Steps
1. `ApplyRamp(minutes int, daysActive int, p RewardPolicy) int` — optional gentle ramp as the habit forms (spec §10 optional). No-op when disabled.

## Acceptance
- [ ] Disabled = identity; enabled = bounded adjustment. Pure. Covered by 3-T01.
