# 3-C02 — RewardPolicy contract

- **Wave:** 3-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/guardian/rewardPolicy.yaml`

## Steps
1. `RewardPolicy{rateMinPerQ(3), passBar(70), dailyCapHours(3), rewardStyle(flat|scaled), diminishingReturns(bool), cooldownMin(10)}` (defaults = spec §10).

## Acceptance
- [ ] Valid 3.1; defaults match spec; codegen emits types.
