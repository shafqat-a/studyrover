# 3-A05 — GET /guardian/sessions

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D03, 3-F06

## Owns
- `guardian/internal/http/sessions.go`

## Steps
1. `SessionsList`: active grants + remaining time (from session manager). Parent-guarded.

## Acceptance
- [ ] Lists active grants with countdown. Matches 3-C03.
