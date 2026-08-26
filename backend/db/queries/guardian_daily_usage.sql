-- Guardian daily usage (0027): earned minutes + pass count per student per day.

-- name: GetGuardianDailyUsage :one
SELECT * FROM guardian_daily_usage WHERE student_id = $1 AND day = $2;

-- name: AddGuardianDailyUsage :one
INSERT INTO guardian_daily_usage (student_id, day, minutes, passes)
VALUES ($1, $2, $3, $4)
ON CONFLICT (student_id, day) DO UPDATE
SET minutes = guardian_daily_usage.minutes + EXCLUDED.minutes,
    passes  = guardian_daily_usage.passes + EXCLUDED.passes
RETURNING *;

-- name: ListGuardianDailyUsageSince :many
SELECT * FROM guardian_daily_usage
WHERE day >= $1
ORDER BY day DESC, student_id ASC;
