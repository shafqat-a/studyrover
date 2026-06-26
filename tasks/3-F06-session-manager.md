# 3-F06 — Session manager

- **Wave:** 3-foundation · **Module:** session · **Lang:** Go · **Depends on:** 3-F03, 3-D03

## Goal
Track active grants, count down, and auto-revoke on expiry — surviving restarts (spec §5 session manager).

## Owns
- `guardian/internal/session/manager.go` (schedule revokes; reconcile from DB on boot; expose remaining time)

## Steps
1. On grant: persist + schedule `Wall.Revoke` at `expiresAt`. On boot: reload active grants, reschedule.
2. Provide `Remaining(mac)` for the time UI.

## Acceptance
- [ ] Auto-revokes on expiry; reschedules after restart. Covered by 3-T02.
