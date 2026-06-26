# D12 — Init migration (0001)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03

## Goal
The base migration: extensions and shared helpers, applied before all tables. Fixed number `0001` so it always runs first.

## Owns
- `backend/db/migrations/0001_init.up.sql`
- `backend/db/migrations/0001_init.down.sql`

## Steps
1. `create extension if not exists pgcrypto;` (for `gen_random_uuid()`).
2. Optional `updated_at` trigger helper function. No tables here.
3. Document the project convention: text columns + `CHECK` constraints for enums (keep sqlc simple), `id text primary key default gen_random_uuid()`.

## Acceptance
- [ ] `migrate up` applies `0001` cleanly; `down` reverses.
> Per-table migrations are numbered 0002+ and owned by other D-tasks; numbers are fixed to avoid collisions.
