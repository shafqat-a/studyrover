# H10 — useAuth

- **Wave:** 2d · **Module:** hooks · **Lang:** TS/React · **Depends on:** W01

## Goal
Client auth hooks wrapping WebAuthn browser ceremonies (parent) + student sign-in.

## Owns
- `frontend/src/hooks/useAuth.ts`

## Reads
- `@simplewebauthn/browser`, generated client (`/auth/*`)

## Steps
1. `useRegisterParent()` (begin→ceremony→finish, incl. backup key), `useLoginParent()`, `useStudentSignIn()`, `useSession()`.

## Acceptance
- [ ] Parent register/login via passkey works against the API; student sign-in sets session.
