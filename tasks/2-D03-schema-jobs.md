# 2-D03 — Jobs schema (0015)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03, 2-C03

## Owns
- `backend/db/migrations/0015_jobs.up.sql` / `.down.sql`
- `backend/db/queries/jobs.sql`

## Steps
1. `job(id, type, status default 'queued', subject_id?, payload jsonb, result jsonb?, progress int default 0, error?, attempts int default 0, run_after timestamptz, created_at, updated_at)` + index on (status, run_after).
2. Queries: Enqueue, ClaimNext (FOR UPDATE SKIP LOCKED), UpdateProgress, Complete, Fail, GetJob, ListJobs.

## Acceptance
- [ ] migrate up + sqlc generate; supports the 2-F06 worker.
