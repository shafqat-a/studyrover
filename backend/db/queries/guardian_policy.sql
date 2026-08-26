-- Guardian policy singleton (0027). Rate/cap/pass bar come from settings.

-- name: GetGuardianPolicy :one
SELECT * FROM guardian_policy WHERE id = 'default';

-- name: UpdateGuardianPolicy :one
-- Partial update: NULL params leave the existing value untouched.
UPDATE guardian_policy
SET
    enabled             = COALESCE(sqlc.narg('enabled'), enabled),
    reward_style        = COALESCE(sqlc.narg('reward_style'), reward_style),
    diminishing_returns = COALESCE(sqlc.narg('diminishing_returns'), diminishing_returns),
    updated_at          = now()
WHERE id = 'default'
RETURNING *;
