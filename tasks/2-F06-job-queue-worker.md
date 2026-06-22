# 2-F06 — Job queue + worker

- **Wave:** 2-foundation · **Module:** jobs · **Lang:** Go · **Depends on:** F03, 2-D03

## Goal
Postgres-backed async job system driving ingest/syllabus/question-gen `queued→processing→ready/error` with retry/backoff.

## Owns
- `backend/internal/jobs/queue.go` (enqueue, claim, complete, fail; uses `jobs` table 2-D03)
- `backend/internal/jobs/worker.go` (worker pool; dispatch by `Job.type` to registered handlers)
- `backend/internal/jobs/handler.go` (`Handler` registry interface)

## Steps
1. SKIP-LOCKED claim; bounded worker pool; exponential backoff; progress updates.
2. Handlers registered by the features (ingest/syllabus/questions) at wiring (2-W04).

## Acceptance
- [ ] Enqueue→process→ready lifecycle works; retries on failure; covered by 2-T03.
