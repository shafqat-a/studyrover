# 3-D02 — RewardPolicy schema (g0003)

- **Wave:** 3-db · **Module:** db · **Lang:** SQL · **Depends on:** 3-D07, 3-C02

## Owns
- `guardian/db/migrations/g0003_reward_policy.up.sql` / `.down.sql`
- `guardian/db/queries/reward_policy.sql`

## Steps
1. `reward_policy(id default 'singleton', rate_min_per_q int default 3, pass_bar int default 70, daily_cap_hours int default 3, reward_style text default 'flat', diminishing_returns bool default false, cooldown_min int default 10)`.
2. Queries: GetPolicy, UpsertPolicy.

## Acceptance
- [ ] Single-row; defaults = spec §10; sqlc generate.
