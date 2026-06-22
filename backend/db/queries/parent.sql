-- Parent + Credential queries (D10) — contract C08.

-- name: CreateParent :one
INSERT INTO parent (display_name, email)
VALUES ($1, $2)
RETURNING *;

-- name: GetParentByEmail :one
SELECT * FROM parent
WHERE email = $1;

-- name: AddCredential :one
INSERT INTO credential (parent_id, credential_id, public_key, counter, is_backup)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;

-- name: ListCredentialsByParent :many
SELECT * FROM credential
WHERE parent_id = $1;

-- name: UpdateCredentialCounter :one
UPDATE credential
SET counter = $2
WHERE credential_id = $1
RETURNING *;
