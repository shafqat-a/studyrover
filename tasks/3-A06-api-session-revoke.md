# 3-A06 — POST /guardian/sessions/{id}/revoke

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D03, 3-F03, 3-F06

## Owns
- `guardian/internal/http/session_revoke.go`

## Steps
1. `SessionRevoke`: call `Wall.Revoke`, mark grant revoked, cancel timer. Parent-guarded.

## Acceptance
- [ ] Revokes now; device loses access; grant marked revoked.
