-- Guardian grants (0027). Active = revoked_at IS NULL AND expires_at > now().

-- name: CreateGuardianGrant :one
INSERT INTO guardian_grant (
    device_id, student_id, mac, minutes, source, attempt_id, reason, wall_ref, started_at, expires_at
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
RETURNING *;

-- name: GetGuardianGrant :one
SELECT * FROM guardian_grant WHERE id = $1;

-- name: ListActiveGuardianGrants :many
SELECT * FROM guardian_grant
WHERE revoked_at IS NULL AND expires_at > sqlc.arg('now')
ORDER BY expires_at ASC;

-- name: ListActiveGuardianGrantsByStudent :many
SELECT * FROM guardian_grant
WHERE student_id = $1 AND revoked_at IS NULL AND expires_at > sqlc.arg('now')
ORDER BY expires_at DESC;

-- name: ListActiveGuardianGrantsByDevice :many
SELECT * FROM guardian_grant
WHERE device_id = $1 AND revoked_at IS NULL AND expires_at > sqlc.arg('now')
ORDER BY expires_at DESC;

-- name: ListRecentGuardianGrants :many
SELECT * FROM guardian_grant
ORDER BY started_at DESC, id DESC
LIMIT $1;

-- name: ListRecentGuardianGrantsByStudent :many
SELECT * FROM guardian_grant
WHERE student_id = $1
ORDER BY started_at DESC, id DESC
LIMIT $2;

-- name: RevokeGuardianGrant :one
UPDATE guardian_grant
SET revoked_at = sqlc.arg('revoked_at')
WHERE id = sqlc.arg('id') AND revoked_at IS NULL
RETURNING *;

-- name: ExpireGuardianGrants :many
-- Mark grants whose time ran out as revoked (the wall enforced expiry).
UPDATE guardian_grant
SET revoked_at = expires_at
WHERE revoked_at IS NULL AND expires_at <= sqlc.arg('now')
RETURNING *;
