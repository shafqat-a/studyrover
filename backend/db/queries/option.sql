-- name: CreateOption :one
INSERT INTO option (question_id, text, "order")
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListOptionsByQuestion :many
SELECT * FROM option
WHERE question_id = $1
ORDER BY "order", id;

-- name: ListOptionsByQuestionIDs :many
SELECT * FROM option
WHERE question_id = ANY(@question_ids::uuid[])
ORDER BY question_id, "order", id;

-- name: DeleteOptionsByQuestion :exec
DELETE FROM option
WHERE question_id = $1;
