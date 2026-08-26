-- Guardian override log (0027).

-- name: InsertGuardianOverride :one
INSERT INTO guardian_override_log (device_id, device_name, minutes, reason, who)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListGuardianOverrides :many
SELECT * FROM guardian_override_log ORDER BY at DESC, id DESC LIMIT $1;
