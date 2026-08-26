-- ScoreEvent outbox queries (0026) — contract C10. The platform appends;
-- the Guardian reads forward from a cursor.

-- name: InsertScoreEvent :one
INSERT INTO score_event (
    attempt_id, student_id, subject_id, exam_definition_id,
    scope_topic_ids, size, score_pct, passed, per_topic
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
ON CONFLICT (attempt_id) DO UPDATE SET attempt_id = EXCLUDED.attempt_id
RETURNING *;

-- name: ListScoreEventsAfter :many
-- Forward scan for the Guardian subscriber: rows newer than the cursor, oldest first.
SELECT * FROM score_event
WHERE id > sqlc.arg('after_id')
ORDER BY id ASC
LIMIT sqlc.arg('row_limit');

-- name: GetScoreEventByAttempt :one
SELECT * FROM score_event WHERE attempt_id = $1;
