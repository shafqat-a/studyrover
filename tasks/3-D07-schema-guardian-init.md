# 3-D07 — Guardian init migration (g0001)

- **Wave:** 3-db · **Module:** db · **Lang:** SQL · **Depends on:** 3-F01

## Goal
Base migration for the Guardian's own schema (separate migration set under `guardian/db`).

## Owns
- `guardian/db/migrations/g0001_init.up.sql` / `.down.sql`
- `guardian/sqlc.yaml`

## Steps
1. `create extension if not exists pgcrypto;`. Define the `guardian` schema/namespace. sqlc config for `guardian/internal/store`.

## Acceptance
- [ ] migrate up applies; sqlc configured for guardian queries.
> Guardian numbering is `g0001+` so it never collides with platform migrations.
