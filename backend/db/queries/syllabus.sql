-- Syllabus queries — the curriculum grouping above subjects (e.g. "Class V").

-- name: CreateSyllabus :one
INSERT INTO syllabus (name, description)
VALUES ($1, $2)
RETURNING *;

-- name: GetSyllabus :one
SELECT * FROM syllabus
WHERE id = $1;

-- name: ListSyllabuses :many
SELECT * FROM syllabus
ORDER BY created_at ASC, id ASC;

-- name: UpdateSyllabus :one
-- Partial update: NULL params leave the existing value untouched.
UPDATE syllabus
SET
    name        = COALESCE(sqlc.narg('name'), name),
    description = COALESCE(sqlc.narg('description'), description)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteSyllabus :exec
-- Subjects referencing the syllabus are un-grouped via ON DELETE SET NULL.
DELETE FROM syllabus
WHERE id = $1;
