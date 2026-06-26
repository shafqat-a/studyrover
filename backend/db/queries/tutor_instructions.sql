-- TutorInstructions queries (D04) — contract 2-C06. One row per subject.

-- name: GetTutorInstructionsBySubject :one
SELECT * FROM tutor_instructions
WHERE subject_id = $1;

-- name: UpsertTutorInstructions :one
INSERT INTO tutor_instructions (subject_id, custom_instructions, tone, target_language, difficulty)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (subject_id) DO UPDATE
SET
    custom_instructions = EXCLUDED.custom_instructions,
    tone                = EXCLUDED.tone,
    target_language     = EXCLUDED.target_language,
    difficulty          = EXCLUDED.difficulty,
    updated_at          = now()
RETURNING *;
