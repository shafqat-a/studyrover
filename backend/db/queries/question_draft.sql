-- QuestionDraft queries (D06) — contract 2-C05.

-- name: InsertQuestionDraft :one
-- Insert a single generated draft. Used in a batch loop for generation results.
INSERT INTO question_draft (subject_id, topic_id, text, options, correct_option_index, difficulty)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: ListQuestionDrafts :many
-- List drafts, optionally filtering by status. When sqlc.narg('status') is NULL
-- the filter is skipped and drafts of every status return, newest first.
SELECT * FROM question_draft
WHERE (sqlc.narg('status')::text IS NULL OR status = sqlc.narg('status')::text)
ORDER BY created_at DESC, id DESC;

-- name: GetQuestionDraft :one
SELECT * FROM question_draft
WHERE id = $1;

-- name: SetQuestionDraftStatus :one
-- Advance a draft through its review lifecycle (pending → approved/rejected).
UPDATE question_draft
SET status = $2
WHERE id = $1
RETURNING *;
