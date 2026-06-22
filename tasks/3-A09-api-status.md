# 3-A09 — GET /guardian/status

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D03, 3-D05, 3-F06

## Owns
- `guardian/internal/http/status.go`

## Steps
1. `StatusGet`: active sessions + remaining, grant/override history, daily usage. Parent-guarded.

## Acceptance
- [ ] Returns `GuardianStatus` (3-C05).
