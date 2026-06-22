-- Conversation + Message queries (D01) — contract 2-C01.

-- name: CreateConversation :one
INSERT INTO conversation (subject_id, student_id)
VALUES ($1, $2)
RETURNING *;

-- name: GetConversation :one
SELECT * FROM conversation
WHERE id = $1;

-- name: AppendMessage :one
INSERT INTO message (conversation_id, role, text, citations)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: ListMessages :many
SELECT * FROM message
WHERE conversation_id = $1
ORDER BY created_at, id;
