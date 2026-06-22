-- Guidance queries (D05) — contract 2-C07.

-- name: CreateGuidance :one
INSERT INTO guidance (scope, subject_id, text)
VALUES ($1, $2, $3)
RETURNING *;

-- name: ListGuidance :many
-- Optionally filtered by scope and/or subject. When a narg is NULL the
-- corresponding filter is skipped. Newest first.
SELECT * FROM guidance
WHERE (sqlc.narg('scope')::text IS NULL OR scope = sqlc.narg('scope')::text)
  AND (sqlc.narg('subject_id')::text IS NULL OR subject_id = sqlc.narg('subject_id')::text)
ORDER BY created_at DESC, id DESC;

-- name: DeleteGuidance :exec
DELETE FROM guidance
WHERE id = $1;
