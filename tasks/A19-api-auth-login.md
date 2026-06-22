# A19 — Parent login

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D10, F09

## Owns
- `backend/internal/http/auth_login.go`

## Steps
1. `AuthLoginBegin` (email → authentication options for that parent's credentials).
2. `AuthLoginFinish` (verify assertion, bump counter, set session). Works with backup key too.

## Acceptance
- [ ] Valid assertion logs in; counter updated; bad assertion → 401.
