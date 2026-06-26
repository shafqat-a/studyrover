# 2-W02 — Router: mount Phase-2 handlers + start worker

- **Wave:** 2-wiring (continuous) · **Module:** wiring · **Lang:** Go · **Depends on:** 2-A01..2-A13, 2-F06, W02

## Owns
- Phase-2 route registration within `backend/internal/http/server.go` (extends W02)
- worker startup in `backend/internal/app/wire.go` (extends W04)

## Steps
1. Mount tutor/study-guide/jobs/syllabus/questions/guidance/dashboard routes (guards per CONTRACTS-P2).
2. Start the job worker pool on boot; register ingest/syllabus/questiongen handlers.

## Acceptance
- [ ] Phase-2 endpoints reachable; worker processes jobs. Same-owner coordination with W02/W04.
