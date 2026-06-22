# W02 — Go chi router + middleware + static SPA

- **Wave:** 4 (runs continuously) · **Module:** wiring · **Lang:** Go · **Depends on:** A01–A21, F09, W01

## Goal
Define the `Handlers` struct (deps) and the chi router that mounts every A-handler, applies middleware, and serves the embedded SPA. Single owner of routing.

## Owns
- `backend/internal/http/server.go` (`Handlers` struct + deps; `NewRouter(h) http.Handler`)
- `backend/internal/http/middleware.go` (logging, recover, CORS, auth wiring)
- `backend/internal/http/static.go` (`go:embed` built `frontend/dist`; SPA fallback to index.html)
- `backend/internal/http/problem.go` (Problem response helper, C11)

## Reads
- generated chi-server interface (W01), `internal/auth` (F09), all `http/*.go` handler methods (A-tasks)

## Steps
1. Declare `Handlers` with store + core deps; A-tasks attach methods in their own files.
2. Mount routes under `/api`, applying `RequireParent`/`RequireStudent` per CONTRACTS.md. Implement the generated server interface.
3. Serve embedded SPA for non-API routes (client-side routing fallback).

## Acceptance
- [ ] All endpoints reachable; auth enforced; SPA served from the binary.
- [ ] Implements the generated server interface; `go build ./...` green.
