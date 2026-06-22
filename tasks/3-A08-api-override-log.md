# 3-A08 — GET /guardian/override-log

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D04, 3-F07

## Owns
- `guardian/internal/http/override_log.go`

## Steps
1. `OverrideLogList`: paginated override history. Parent-guarded.

## Acceptance
- [ ] Lists overrides (timestamp, duration, who). Matches 3-C04.
