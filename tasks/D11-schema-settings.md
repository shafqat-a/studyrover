# D11 — Settings schema (0004)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C09

## Owns
- `backend/db/migrations/0004_settings.up.sql` / `.down.sql`
- `backend/db/queries/settings.sql`

## Reads
- `tasks/CONTRACTS.md` §C09

## Steps
1. `settings(id text primary key default 'singleton', reward_rate_min_per_q int default 3, daily_cap_hours int default 3, default_exam_size int default 20, default_pass_bar int default 70, default_cooldown_min int default 10, knowledge_backend text default 'notebooklm' check(...), difficulty_ramp bool default false)`.
2. Queries: GetSettings, UpsertSettings.

## Acceptance
- [ ] Single-row pattern; DB defaults match spec; sqlc generates.
