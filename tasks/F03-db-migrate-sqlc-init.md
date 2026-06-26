# F03 — Postgres + golang-migrate + sqlc setup

- **Wave:** 0 · **Module:** foundation · **Lang:** Go/SQL · **Depends on:** F02

## Goal
Wire the database toolchain so each D-task can add a migration + queries file independently and sqlc generates type-safe Go.

## Owns
- `backend/sqlc.yaml` (engine postgresql, queries dir `db/queries`, schema dir `db/migrations`, output `internal/store`)
- `backend/db/migrations/.gitkeep`, `backend/db/queries/.gitkeep`
- `backend/Makefile.db` or migrate make targets (migrate up/down/create), `docker-compose.yml` (local Postgres)

## Steps
1. Configure `sqlc` to read migrations as the schema and emit `pgx/v5` code into `internal/store`.
2. Add `golang-migrate` run scripts; `db:up`/`db:down`.
3. Local Postgres via docker-compose for dev/test.

## Acceptance
- [ ] `sqlc generate` runs (no queries yet = empty output OK).
- [ ] `migrate up` applies an empty/初始 migration against the compose DB.
> The generated store + pgx pool wiring is W04; this task only sets up the toolchain.
