# A18 — Parent WebAuthn register

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D10, F09

## Goal
Register a parent + FIDO2 authenticator, including a **backup** key (spec: avoid lockout).

## Owns
- `backend/internal/http/auth_register.go`

## Reads
- `internal/auth` (webauthn, session — F09)

## Steps
1. `AuthRegisterBegin`: create/lookup Parent, return registration options (store challenge).
2. `AuthRegisterFinish`: verify, persist `Credential` (`isBackup=true` for 2nd key), start parent session.

## Acceptance
- [ ] Two credentials registrable (primary + backup); session on finish; invalid attestation → 400.
