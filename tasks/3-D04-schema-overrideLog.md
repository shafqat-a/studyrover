# 3-D04 — Override log schema (g0005)

- **Wave:** 3-db · **Module:** db · **Lang:** SQL · **Depends on:** 3-D07, 3-C04

## Owns
- `guardian/db/migrations/g0005_override_log.up.sql` / `.down.sql`
- `guardian/db/queries/override_log.sql`

## Steps
1. `override_log(id, device_id fk, duration_min int, reason?, who, at default now())`.
2. Queries: InsertOverride, ListOverrides.

## Acceptance
- [ ] migrate up + sqlc generate; every override logged (spec requirement).
