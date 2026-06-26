-- Settings queries (D11) — contract C09. Single-row ('singleton') pattern.

-- name: GetSettings :one
-- Returns the singleton settings row.
SELECT * FROM settings
WHERE id = 'singleton';

-- name: UpsertSettings :one
-- Inserts or updates the singleton settings row. NULL params fall back to the
-- spec defaults on insert and leave the existing value untouched on update.
INSERT INTO settings (
    id,
    reward_rate_min_per_q,
    daily_cap_hours,
    default_exam_size,
    default_pass_bar,
    default_cooldown_min,
    knowledge_backend,
    difficulty_ramp
)
VALUES (
    'singleton',
    COALESCE(sqlc.narg('reward_rate_min_per_q'), 3),
    COALESCE(sqlc.narg('daily_cap_hours'), 3),
    COALESCE(sqlc.narg('default_exam_size'), 20),
    COALESCE(sqlc.narg('default_pass_bar'), 70),
    COALESCE(sqlc.narg('default_cooldown_min'), 10),
    COALESCE(sqlc.narg('knowledge_backend'), 'notebooklm'),
    COALESCE(sqlc.narg('difficulty_ramp'), false)
)
ON CONFLICT (id) DO UPDATE
SET
    reward_rate_min_per_q = COALESCE(sqlc.narg('reward_rate_min_per_q'), settings.reward_rate_min_per_q),
    daily_cap_hours       = COALESCE(sqlc.narg('daily_cap_hours'), settings.daily_cap_hours),
    default_exam_size     = COALESCE(sqlc.narg('default_exam_size'), settings.default_exam_size),
    default_pass_bar      = COALESCE(sqlc.narg('default_pass_bar'), settings.default_pass_bar),
    default_cooldown_min  = COALESCE(sqlc.narg('default_cooldown_min'), settings.default_cooldown_min),
    knowledge_backend     = COALESCE(sqlc.narg('knowledge_backend'), settings.knowledge_backend),
    difficulty_ramp       = COALESCE(sqlc.narg('difficulty_ramp'), settings.difficulty_ramp)
RETURNING *;
