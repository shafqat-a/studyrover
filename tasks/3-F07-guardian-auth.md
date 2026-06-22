# 3-F07 — Guardian auth (FIDO2 override)

- **Wave:** 3-foundation · **Module:** auth · **Lang:** Go · **Depends on:** 3-F01

## Goal
Parent FIDO2/WebAuthn for the Guardian (override authorization). Reuses the same credentials concept as F09.

## Owns
- `guardian/internal/auth/webauthn.go`, `guardian/internal/auth/middleware.go`

## Steps
1. Verify a parent WebAuthn assertion to authorize overrides (3-A07); `RequireParent` middleware. Log every override.

## Acceptance
- [ ] Override requires a valid FIDO2 assertion; unauthorized → 401. Backup key works.
