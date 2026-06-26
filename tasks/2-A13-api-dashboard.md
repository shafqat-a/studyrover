# 2-A13 — GET /dashboard

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D07, 2-L05, F09

## Owns
- `backend/internal/http/dashboard.go`

## Steps
1. `DashboardGet` (`?studentId`): aggregate via 2-L05 → `Dashboard`. No internet-time fields.

## Acceptance
- [ ] Returns mastery/timeline/history/streak/guidance; parent-guarded. Matches 2-C08.
