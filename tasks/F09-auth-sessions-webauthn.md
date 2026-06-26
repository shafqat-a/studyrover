# F09 — Backend auth: sessions + go-webauthn + middleware

- **Wave:** 0 · **Module:** foundation · **Lang:** Go · **Depends on:** F02

## Goal
Session primitives + FIDO2 (WebAuthn) helpers + route middleware used by parent auth (A18/A19) and student sign-in (A20). Spec: parent override via FIDO2; register a **backup** key.

## Owns
- `backend/internal/auth/session.go` (signed/secure cookie sessions; `ParentFromCtx`, `StudentFromCtx`)
- `backend/internal/auth/webauthn.go` (wraps `go-webauthn`: begin/finish registration & login; challenge store)
- `backend/internal/auth/middleware.go` (`RequireParent`, `RequireStudent` chi middleware → 401 Problem)

## Reads
- generated `Session`/`Problem` types (C08, C11)

## Steps
1. Configure RP from config (`RP_ID`, `RP_ORIGIN`). Cookie session with `SESSION_SECRET`.
2. Middleware injects identity into context or returns 401 `Problem{UNAUTHORIZED}`.
3. Support backup credential flag.

## Acceptance
- [ ] `RequireParent` blocks unauthenticated, passes with session.
- [ ] Registration + login option generation unit-tested; backup credential supported.
