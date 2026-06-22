# A20 — Student sign-in

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D09, F09

## Owns
- `backend/internal/http/auth_student.go`

## Steps
1. `AuthStudent`: `{studentId, pin?}` — verify pin if `pin_hash` set, else pick-and-go. Set student session (distinct from parent).

## Acceptance
- [ ] Sets student session; wrong pin → 401.
