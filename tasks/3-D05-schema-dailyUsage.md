# 3-D05 — Daily usage schema (g0006)

- **Wave:** 3-db · **Module:** db · **Lang:** SQL · **Depends on:** 3-D07

## Owns
- `guardian/db/migrations/g0006_daily_usage.up.sql` / `.down.sql`
- `guardian/db/queries/daily_usage.sql`

## Steps
1. `daily_usage(student_id, day date, minutes_granted int, grants_count int, primary key(student_id, day))` — for daily cap + diminishing returns.
2. Queries: GetUsage(student,day), IncrementUsage.

## Acceptance
- [ ] migrate up + sqlc generate; supports 3-R02/3-R03.
