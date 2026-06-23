-- D05 — Question queries (matches §C05). Options live in D06.

-- name: CreateQuestion :one
INSERT INTO question (
    subject_id,
    topic_id,
    text,
    correct_option_id,
    difficulty,
    enabled
) VALUES (
    $1, $2, $3, $4, COALESCE(sqlc.narg('difficulty'), 'medium'), COALESCE(sqlc.narg('enabled'), true)
)
RETURNING *;

-- name: GetQuestion :one
SELECT * FROM question
WHERE id = $1;

-- name: ListQuestionsBySubject :many
SELECT * FROM question
WHERE subject_id = $1
ORDER BY created_at DESC, id
LIMIT $2 OFFSET $3;

-- name: CountQuestionsBySubject :one
SELECT count(*) FROM question
WHERE subject_id = $1;

-- name: ListQuestionsByTopic :many
SELECT * FROM question
WHERE topic_id = $1
ORDER BY created_at DESC, id
LIMIT $2 OFFSET $3;

-- name: CountQuestionsByTopic :one
SELECT count(*) FROM question
WHERE topic_id = $1;

-- name: ListEligibleForExam :many
-- Eligible question bank for exam assembly (L04 / L08): enabled questions in the
-- subject, narrowed to a topic scope when provided. An empty scope array means
-- "whole subject" (no topic filter).
SELECT * FROM question
WHERE subject_id = $1
  AND enabled = true
  AND (
        cardinality(coalesce(sqlc.arg('scope_topic_ids')::text[], '{}'::text[])) = 0
        OR topic_id = ANY(sqlc.arg('scope_topic_ids')::text[])
      )
ORDER BY created_at DESC, id;

-- name: UpdateQuestion :one
UPDATE question
SET
    topic_id          = COALESCE(sqlc.narg('topic_id'), topic_id),
    text              = COALESCE(sqlc.narg('text'), text),
    correct_option_id = COALESCE(sqlc.narg('correct_option_id'), correct_option_id),
    difficulty        = COALESCE(sqlc.narg('difficulty'), difficulty),
    enabled           = COALESCE(sqlc.narg('enabled'), enabled)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteQuestion :exec
DELETE FROM question
WHERE id = $1;
