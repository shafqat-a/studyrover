-- name: CreateExamDefinition :one
INSERT INTO exam_definition (
    subject_id,
    name,
    type,
    scope_topic_ids,
    size,
    pass_bar,
    cooldown_min,
    reward_style
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
)
RETURNING *;

-- name: GetExamDefinition :one
SELECT * FROM exam_definition
WHERE id = $1;

-- name: ListExamDefinitionsBySubject :many
SELECT * FROM exam_definition
WHERE subject_id = $1
ORDER BY created_at DESC, id
LIMIT $2 OFFSET $3;

-- name: CountExamDefinitionsBySubject :one
SELECT count(*) FROM exam_definition
WHERE subject_id = $1;

-- name: UpdateExamDefinition :one
UPDATE exam_definition
SET
    name            = $2,
    type            = $3,
    scope_topic_ids = $4,
    size            = $5,
    pass_bar        = $6,
    cooldown_min    = $7,
    reward_style    = $8
WHERE id = $1
RETURNING *;

-- name: DeleteExamDefinition :exec
DELETE FROM exam_definition
WHERE id = $1;
