# W04 — sqlc gen + pgx pool + store wiring + DI

- **Wave:** 4 (runs continuously) · **Module:** wiring · **Lang:** Go · **Depends on:** D01–D12

## Goal
Run sqlc, provide the pgx pool + generated store, and compose dependencies into the app the entrypoint (F02) calls.

## Owns
- `backend/internal/store/db.go` (pgx pool from `DATABASE_URL`; wraps sqlc `Queries`)
- `backend/internal/store/store.go` (Store interface the handlers/seed depend on; tx helper)
- `backend/internal/app/wire.go` (`app.Run`: open pool, build `Handlers` (W02), start server)

## Reads
- sqlc-generated code (from D-tasks' queries), `internal/http` (W02)

## Steps
1. `sqlc generate` output lands in `internal/store`; add the pool + a `Store` facade.
2. `app.Run` composes config → pool → store → handlers → router → http.Server (graceful shutdown).

## Acceptance
- [ ] `import` of store works after `sqlc generate`; single pool; `cmd/server` runs end-to-end against Postgres.
- [ ] `go build ./...` green.
