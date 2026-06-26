# P01 — Parent setup (screen 1.1)

- **Wave:** 3 · **Module:** pages · **Lang:** TS/React · **Depends on:** H10, A18, U01, U02

## Goal
First-run parent account + passkey registration, with a strongly-prompted **backup** key.

## Owns
- `frontend/src/pages/ParentSetup.tsx`

## Steps
1. Form: display name, email (U02); register passkey (WebAuthn via H10).
2. After primary, prompt backup authenticator (flagged strongly — avoid lockout).
3. Success → navigate to subjects.

## Acceptance
- [ ] Creates parent + ≥1 passkey; backup prompt shown; errors toasted. Matches screen 1.1.
> Register the route in `src/app/router.tsx` via W03.
