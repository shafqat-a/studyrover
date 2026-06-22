# 3-T05 — Device + override API integration

- **Wave:** 3-tests · **Module:** tests · **Lang:** Go · **Depends on:** 3-A01, 3-A07

## Owns
- `guardian/internal/http/guardian_api_test.go`

## Steps
1. Device CRUD; override requires FIDO2 (assert 401 without, grant + log with a stubbed assertion); manual grant + revoke via fake wall.

## Acceptance
- [ ] Device + override + grant/revoke green; override always logged.
