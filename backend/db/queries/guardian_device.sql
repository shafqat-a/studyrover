-- Guardian device registry (0027).

-- name: ListGuardianDevices :many
SELECT * FROM guardian_device ORDER BY created_at ASC, id ASC;

-- name: ListGuardianDevicesByStudent :many
SELECT * FROM guardian_device WHERE student_id = $1 ORDER BY created_at ASC, id ASC;

-- name: GetGuardianDevice :one
SELECT * FROM guardian_device WHERE id = $1;

-- name: GetGuardianDeviceByMAC :one
SELECT * FROM guardian_device WHERE mac = $1;

-- name: CreateGuardianDevice :one
INSERT INTO guardian_device (student_id, name, mac, ip, hostname, gated)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: UpdateGuardianDevice :one
-- Partial update: NULL params leave the existing value untouched.
UPDATE guardian_device
SET
    name     = COALESCE(sqlc.narg('name'), name),
    mac      = COALESCE(sqlc.narg('mac'), mac),
    ip       = COALESCE(sqlc.narg('ip'), ip),
    hostname = COALESCE(sqlc.narg('hostname'), hostname),
    gated    = COALESCE(sqlc.narg('gated'), gated)
WHERE id = sqlc.arg('id')
RETURNING *;

-- name: DeleteGuardianDevice :execrows
DELETE FROM guardian_device WHERE id = $1;
