-- Lesson queries (0028).

-- name: ListLessonsBySubject :many
-- Topic order, so the parent list mirrors the syllabus.
SELECT l.* FROM lesson l
JOIN topic t ON t.id = l.topic_id
WHERE l.subject_id = $1
ORDER BY t."order" ASC, t.name ASC, l.id ASC;

-- name: ListPublishedLessonsBySubject :many
SELECT l.* FROM lesson l
JOIN topic t ON t.id = l.topic_id
WHERE l.subject_id = $1 AND l.status = 'published'
ORDER BY t."order" ASC, t.name ASC, l.id ASC;

-- name: GetLesson :one
SELECT * FROM lesson WHERE id = $1;

-- name: GetLessonByTopic :one
SELECT * FROM lesson WHERE topic_id = $1;

-- name: CreateLesson :one
INSERT INTO lesson (subject_id, topic_id, title, markdown, status, generated_at)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateLesson :one
-- Partial update: NULL params leave the existing value untouched.
UPDATE lesson
SET
    title        = COALESCE(sqlc.narg('title'), title),
    markdown     = COALESCE(sqlc.narg('markdown'), markdown),
    status       = COALESCE(sqlc.narg('status'), status),
    generated_at = COALESCE(sqlc.narg('generated_at'), generated_at),
    updated_at   = now()
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteLesson :execrows
DELETE FROM lesson WHERE id = $1;
