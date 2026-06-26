# 2-L05 — Dashboard aggregation

- **Wave:** 2-core · **Module:** core · **Lang:** Go · **Depends on:** C06, 2-C08

## Owns
- `backend/internal/core/dashboard.go`

## Steps
1. `BuildDashboard(attempts, snapshots, guidance) Dashboard` — mastery, timeline, avg score, streak (reuse L07/L12), guidance. No internet-time.

## Acceptance
- [ ] Correct aggregates on fixtures; no minutes fields. Covered by 2-T02.
