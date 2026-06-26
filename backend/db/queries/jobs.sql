-- Job queue queries (D03) — contract 2-C03. Drives the 2-F06 worker.

-- name: EnqueueJob :one
-- Schedule a new job. run_after defaults to now() when NULL is passed.
INSERT INTO job (type, subject_id, payload, run_after)
VALUES (
    $1,
    sqlc.narg('subject_id'),
    COALESCE(sqlc.narg('payload'), '{}'::jsonb),
    COALESCE(sqlc.narg('run_after'), now())
)
RETURNING *;

-- name: ClaimNextJob :one
-- Atomically claim the oldest runnable queued job and mark it processing.
-- FOR UPDATE SKIP LOCKED lets multiple workers run concurrently without contention.
UPDATE job
SET
    status     = 'processing',
    attempts   = attempts + 1,
    updated_at = now()
WHERE id = (
    SELECT id FROM job
    WHERE status = 'queued'
      AND run_after <= now()
    ORDER BY run_after ASC, created_at ASC
    FOR UPDATE SKIP LOCKED
    LIMIT 1
)
RETURNING *;

-- name: UpdateJobProgress :one
-- Report incremental progress (0-100) while processing.
UPDATE job
SET
    progress   = sqlc.arg('progress'),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: CompleteJob :one
-- Mark a job ready and store its result payload.
UPDATE job
SET
    status     = 'ready',
    progress   = 100,
    result     = sqlc.narg('result'),
    error      = NULL,
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: FailJob :one
-- Mark a job errored and store the failure message.
UPDATE job
SET
    status     = 'error',
    error      = sqlc.narg('error'),
    updated_at = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: GetJob :one
SELECT * FROM job
WHERE id = $1;

-- name: ListJobs :many
-- Optionally filtered by subject, newest first.
SELECT * FROM job
WHERE (sqlc.narg('subject_id')::text IS NULL OR subject_id = sqlc.narg('subject_id')::text)
ORDER BY created_at DESC, id DESC
LIMIT $1 OFFSET $2;
