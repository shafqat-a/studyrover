# 2-T03 — Job queue/worker tests

- **Wave:** 2-tests · **Module:** tests · **Lang:** Go · **Depends on:** 2-F06

## Owns
- `backend/internal/jobs/queue_test.go`, `worker_test.go`

## Steps
1. Enqueue→claim→complete; retry/backoff on failure; concurrent claim safety (SKIP LOCKED) against test DB.

## Acceptance
- [ ] Lifecycle + retry + concurrency green.
