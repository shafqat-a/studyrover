-- Guardian score inbox (0027): one row per consumed score_event; cursor = max id.

-- name: GetGuardianInboxCursor :one
SELECT COALESCE(MAX(score_event_id), 0)::bigint AS cursor FROM guardian_score_inbox;

-- name: GetGuardianInboxEntry :one
SELECT * FROM guardian_score_inbox WHERE score_event_id = $1;

-- name: InsertGuardianInboxEntry :one
INSERT INTO guardian_score_inbox (score_event_id, minutes, grant_id, note)
VALUES ($1, $2, $3, $4)
ON CONFLICT (score_event_id) DO NOTHING
RETURNING *;

-- name: GetGuardianInboxByAttempt :one
SELECT i.* FROM guardian_score_inbox i
JOIN score_event e ON e.id = i.score_event_id
WHERE e.attempt_id = $1;
