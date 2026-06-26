-- Student queries (D09) — contract C07.

-- name: GetStudent :one
-- Single-student Phase 1: return the one (newest) student profile.
SELECT * FROM student
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: GetStudentByID :one
SELECT * FROM student
WHERE id = $1;

-- name: UpsertStudent :one
-- Insert when id is NULL, otherwise update the existing row. Partial update:
-- NULL params leave the existing value untouched.
INSERT INTO student (id, name, grade_level, avatar_url, notes, pin_hash)
VALUES (
    COALESCE(sqlc.narg('id'), gen_random_uuid()),
    COALESCE(sqlc.narg('name'), ''),
    sqlc.narg('grade_level'),
    sqlc.narg('avatar_url'),
    sqlc.narg('notes'),
    sqlc.narg('pin_hash')
)
ON CONFLICT (id) DO UPDATE
SET
    name        = COALESCE(sqlc.narg('name'), student.name),
    grade_level = COALESCE(sqlc.narg('grade_level'), student.grade_level),
    avatar_url  = COALESCE(sqlc.narg('avatar_url'), student.avatar_url),
    notes       = COALESCE(sqlc.narg('notes'), student.notes),
    pin_hash    = COALESCE(sqlc.narg('pin_hash'), student.pin_hash)
RETURNING *;
