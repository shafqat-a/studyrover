# 3-F01 — Guardian Go module init

- **Wave:** 3-foundation · **Module:** foundation · **Lang:** Go · **Depends on:** F01

## Goal
Stand up the **separate** Guardian binary/module — the optional add-on. Independent of the Study Platform except for reading ScoreEvents (C10).

## Owns
- `guardian/go.mod`
- `guardian/cmd/guardian/main.go` (minimal: config → `app.Run`)
- `guardian/internal/config/config.go` (RouterOS creds, `SCORE_SOURCE_DSN`/platform DB, `PORT`, FIDO2 RP)

## Steps
1. New module `.../guardian`; chi + pgx + go-webauthn deps. Thin main; composition in 3-W04.

## Acceptance
- [ ] `go build ./...` in `guardian/` succeeds; boots reading config.
> Decoupled: removing `guardian/` leaves the platform fully working.
