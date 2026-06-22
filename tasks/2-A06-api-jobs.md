# 2-A06 — GET /jobs/{id} · GET /jobs

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D03, F09

## Owns
- `backend/internal/http/jobs.go`

## Steps
1. `JobGet` (status/progress/result/error), `JobsList` (`?subjectId`). Optional SSE progress stream (2-F08).

## Acceptance
- [ ] Returns job status; list scoped; parent-guarded.
