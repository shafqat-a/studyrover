# F02 — Go module init + chi + config

- **Wave:** 0 · **Module:** foundation · **Lang:** Go · **Depends on:** F01

## Goal
Initialize the Go backend module, HTTP server entrypoint, and config loading. The prod runtime.

## Owns
- `backend/go.mod`, `backend/go.sum`
- `backend/cmd/server/main.go` (minimal: load config → `app.Run(ctx)`; composition lives in W04)
- `backend/internal/config/config.go` (env: `PORT`, `DATABASE_URL`, `SESSION_SECRET`, `RP_ID`, `RP_ORIGIN`)

## Steps
1. `go mod init github.com/<org>/studyrover/backend`; add `chi`, `pgx`, `go-webauthn` deps.
2. `main.go` stays thin — parse config, call into the app package (owned by W04). Graceful shutdown.

## Acceptance
- [ ] `go build ./...` succeeds.
- [ ] `cmd/server` boots and reads config from env.
> Router + DI are W02/W04; keep `main.go` minimal so it never conflicts with them.
