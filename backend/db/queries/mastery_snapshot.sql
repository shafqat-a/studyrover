-- MasterySnapshot queries (D07) — contract 2-C08 (Dashboard timeline).

-- name: InsertSnapshot :one
INSERT INTO mastery_snapshot (student_id, topic_id, mastery, attempts)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListSnapshotsByStudent :many
-- Range-filtered timeline for the dashboard. NULL range bounds are skipped, so
-- omitting both returns the student's full history, oldest first for charting.
SELECT * FROM mastery_snapshot
WHERE student_id = sqlc.arg('student_id')
  AND (sqlc.narg('from')::timestamptz IS NULL OR captured_at >= sqlc.narg('from')::timestamptz)
  AND (sqlc.narg('to')::timestamptz IS NULL OR captured_at <= sqlc.narg('to')::timestamptz)
ORDER BY captured_at ASC, id ASC;

-- name: LatestByStudent :many
-- Most recent snapshot per topic for a student (current mastery state).
SELECT DISTINCT ON (topic_id) *
FROM mastery_snapshot
WHERE student_id = $1
ORDER BY topic_id, captured_at DESC, id DESC;
