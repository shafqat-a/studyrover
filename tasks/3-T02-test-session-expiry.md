# 3-T02 — Session expiry/countdown tests

- **Wave:** 3-tests · **Module:** tests · **Lang:** Go · **Depends on:** 3-L01, 3-F06

## Owns
- `guardian/internal/core/expiry_test.go`
- `guardian/internal/session/manager_test.go`

## Steps
1. Expiry math (injected clock); manager schedules revoke; reload-on-boot reschedules; revoke calls fake Wall.

## Acceptance
- [ ] Auto-revoke + restart reconciliation green (fake wall).
