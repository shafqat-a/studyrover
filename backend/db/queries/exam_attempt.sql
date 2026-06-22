-- ExamAttempt queries (D07, contract C06).
-- Supports the exam loop: start, fetch, submit (grade), history, cooldown lookup.

-- name: CreateAttempt :one
INSERT INTO exam_attempt (
    exam_definition_id,
    student_id,
    question_ids
) VALUES (
    $1, $2, $3
)
RETURNING *;

-- name: GetAttempt :one
SELECT * FROM exam_attempt
WHERE id = $1;

-- name: MarkSubmitted :one
UPDATE exam_attempt
SET status         = 'submitted',
    score_pct      = $2,
    passed         = $3,
    per_topic      = $4,
    cooldown_until = $5,
    submitted_at   = now()
WHERE id = $1
RETURNING *;

-- name: ListByStudent :many
SELECT * FROM exam_attempt
WHERE student_id = $1
ORDER BY started_at DESC
LIMIT $2 OFFSET $3;

-- name: CountByStudent :one
SELECT count(*) FROM exam_attempt
WHERE student_id = $1;

-- name: GetLastFailedForExam :one
SELECT * FROM exam_attempt
WHERE exam_definition_id = $1
  AND student_id = $2
  AND status = 'submitted'
  AND passed = false
ORDER BY submitted_at DESC
LIMIT 1;
