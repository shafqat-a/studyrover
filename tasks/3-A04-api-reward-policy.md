# 3-A04 — GET/PUT /guardian/reward-policy

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D02, 3-F07

## Owns
- `guardian/internal/http/reward_policy.go`

## Steps
1. Get/Upsert the singleton `RewardPolicy` (defaults applied). Parent-guarded.

## Acceptance
- [ ] GET returns complete policy; PUT persists. Matches 3-C02.
