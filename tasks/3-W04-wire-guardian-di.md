# 3-W04 — Guardian DI: wall + session + reward + subscription

- **Wave:** 3-wiring (continuous) · **Module:** wiring · **Lang:** Go · **Depends on:** 3-F02..3-F06, 3-A12, 3-D*

## Owns
- `guardian/internal/store/{db.go,store.go}` (pgx pool + sqlc Queries facade)
- `guardian/internal/app/wire.go` (`app.Run`: pool → store → wall (RouterOS or fake by config) → session manager → reward → subscriber/pipeline → router → http.Server)

## Steps
1. Build the Wall from config (fake when no RouterOS creds); start session manager (reconcile on boot); start the ScoreEvent subscriber + intake pipeline; graceful shutdown.

## Acceptance
- [ ] `cmd/guardian` runs end-to-end against Postgres + fake wall; processes a ScoreEvent into a grant. `go build ./...` green.
