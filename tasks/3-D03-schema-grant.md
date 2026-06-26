# 3-D03 — Grant/Session schema (g0004)

- **Wave:** 3-db · **Module:** db · **Lang:** SQL · **Depends on:** 3-D07, 3-C03

## Owns
- `guardian/db/migrations/g0004_grant.up.sql` / `.down.sql`
- `guardian/db/queries/grant.sql`

## Steps
1. `grant(id, device_id fk, mac, minutes int, source text, started_at, expires_at, revoked_at?)` + index on (revoked_at, expires_at).
2. Queries: CreateGrant, ListActive, GetGrant, MarkRevoked, ListHistory.

## Acceptance
- [ ] migrate up + sqlc generate; supports session manager + status.
