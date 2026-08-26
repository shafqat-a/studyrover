-- Lesson resource queries (0028).

-- name: ListLessonResources :many
SELECT * FROM lesson_resource
WHERE lesson_id = $1
ORDER BY position ASC, created_at ASC, id ASC;

-- name: ListLessonResourcesBySubject :many
-- One round trip for the subject's lesson list.
SELECT r.* FROM lesson_resource r
JOIN lesson l ON l.id = r.lesson_id
WHERE l.subject_id = $1
ORDER BY r.lesson_id ASC, r.position ASC, r.created_at ASC, r.id ASC;

-- name: GetLessonResource :one
SELECT * FROM lesson_resource WHERE id = $1 AND lesson_id = $2;

-- name: GetLessonResourceByURL :one
SELECT * FROM lesson_resource WHERE lesson_id = $1 AND url = $2;

-- name: CreateLessonResource :one
INSERT INTO lesson_resource (
    lesson_id, kind, title, url, description, thumbnail_url, external_id, position, source
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
RETURNING *;

-- name: NextLessonResourcePosition :one
SELECT COALESCE(MAX(position), -1) + 1 AS next_position
FROM lesson_resource WHERE lesson_id = $1;

-- name: DeleteLessonResource :execrows
DELETE FROM lesson_resource WHERE id = $1 AND lesson_id = $2;
