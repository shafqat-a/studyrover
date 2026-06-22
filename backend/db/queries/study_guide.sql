-- StudyGuide queries (D02) — contract 2-C02.

-- name: UpsertStudyGuide :one
-- Inserts or replaces the guide for a (subject, topic) pair. topic_id NULL is the
-- subject-level guide. Two partial unique indexes back the conflict targets, so we
-- branch on whether topic_id is supplied.
INSERT INTO study_guide (subject_id, topic_id, markdown, citations)
VALUES (
    sqlc.arg('subject_id'),
    sqlc.narg('topic_id'),
    sqlc.arg('markdown'),
    sqlc.arg('citations')
)
ON CONFLICT (subject_id, topic_id) WHERE topic_id IS NOT NULL
DO UPDATE SET
    markdown     = EXCLUDED.markdown,
    citations    = EXCLUDED.citations,
    generated_at = now()
RETURNING *;

-- name: UpsertSubjectStudyGuide :one
-- Subject-level guide upsert (topic_id IS NULL), backed by study_guide_subject_idx.
INSERT INTO study_guide (subject_id, topic_id, markdown, citations)
VALUES (
    sqlc.arg('subject_id'),
    NULL,
    sqlc.arg('markdown'),
    sqlc.arg('citations')
)
ON CONFLICT (subject_id) WHERE topic_id IS NULL
DO UPDATE SET
    markdown     = EXCLUDED.markdown,
    citations    = EXCLUDED.citations,
    generated_at = now()
RETURNING *;

-- name: GetStudyGuide :one
-- Fetch the guide for a (subject, topic). When sqlc.narg('topic_id') is NULL the
-- subject-level guide is returned.
SELECT * FROM study_guide
WHERE subject_id = sqlc.arg('subject_id')
  AND topic_id IS NOT DISTINCT FROM sqlc.narg('topic_id');
