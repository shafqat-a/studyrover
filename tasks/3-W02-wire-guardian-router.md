# 3-W02 — Guardian router + portal + static

- **Wave:** 3-wiring (continuous) · **Module:** wiring · **Lang:** Go · **Depends on:** 3-A01..3-A12, 3-F07, 3-F08, 3-W01

## Owns
- `guardian/internal/http/server.go` (`Handlers` struct + `NewRouter`; mount `/guardian/*` + `/portal/*`)
- `guardian/internal/http/middleware.go`, `guardian/internal/http/problem.go`

## Steps
1. Mount all guardian endpoints (parent-guarded) + captive portal; serve the gate SPA assets; implement the generated server interface.

## Acceptance
- [ ] Guardian endpoints + portal reachable; `go build ./...` green.
