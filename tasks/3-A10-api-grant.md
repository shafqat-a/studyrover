# 3-A10 — POST /guardian/grant (manual)

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D03, 3-F03, 3-F06, 3-F07

## Owns
- `guardian/internal/http/grant.go`

## Steps
1. `GrantManual`: parent-initiated grant (device, minutes) via Wall + session manager (source=manual). Parent-guarded.

## Acceptance
- [ ] Grants access; appears in status; auto-revokes at expiry.
