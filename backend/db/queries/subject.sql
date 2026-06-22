-- Subject queries (D01) — contract C01.

-- name: CreateSubject :one
INSERT INTO subject (name, color, icon, description)
VALUES ($1, $2, $3, $4)
RETURNING *;

-- name: GetSubject :one
SELECT * FROM subject
WHERE id = $1;

-- name: ListSubjects :many
-- Paginated, optionally filtering by archived. When sqlc.narg('archived') is
-- NULL the filter is skipped and both archived and non-archived rows return.
SELECT * FROM subject
WHERE (sqlc.narg('archived')::boolean IS NULL OR archived = sqlc.narg('archived')::boolean)
ORDER BY created_at DESC, id DESC
LIMIT $1 OFFSET $2;

-- name: CountSubjects :one
SELECT count(*) FROM subject
WHERE (sqlc.narg('archived')::boolean IS NULL OR archived = sqlc.narg('archived')::boolean);

-- name: UpdateSubject :one
-- Partial update: NULL params leave the existing value untouched.
UPDATE subject
SET
    name        = COALESCE(sqlc.narg('name'), name),
    color       = COALESCE(sqlc.narg('color'), color),
    icon        = COALESCE(sqlc.narg('icon'), icon),
    description = COALESCE(sqlc.narg('description'), description),
    archived    = COALESCE(sqlc.narg('archived'), archived)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteSubject :exec
DELETE FROM subject
WHERE id = $1;
