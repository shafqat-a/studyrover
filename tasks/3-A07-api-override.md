# 3-A07 — POST /guardian/override (FIDO2)

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D04, 3-F03, 3-F06, 3-F07

## Goal
Manual/emergency grant bypassing the quiz, authorized by FIDO2, always logged (spec §4.3).

## Owns
- `guardian/internal/http/override.go`

## Steps
1. Verify parent WebAuthn assertion (3-F07); grant device for `durationMin` via Wall + session manager; write `override_log`.

## Acceptance
- [ ] Requires valid FIDO2; grants access; logs timestamp/duration/who. Covered by 3-T05.
