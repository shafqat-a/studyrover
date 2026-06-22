-- File blob queries (D08) — contract 2-D08.

-- name: CreateBlob :one
INSERT INTO file_blob (ref, filename, content_type, size_bytes)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetBlob :one
SELECT * FROM file_blob
WHERE id = $1;

-- name: DeleteBlob :exec
DELETE FROM file_blob
WHERE id = $1;
