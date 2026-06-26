-- answer.sql — queries for the answer table (D08, contract C06).

-- InsertAnswers bulk-inserts all answers for an attempt in a single round trip
-- (pgx COPY). Submit grades every question and writes the whole set at once;
-- the unique(attempt_id, question_id) constraint guarantees at most one answer
-- per question per attempt.
-- name: InsertAnswers :copyfrom
INSERT INTO answer (attempt_id, question_id, selected_option_id, correct)
VALUES ($1, $2, $3, $4);

-- ListAnswersByAttempt returns every answer recorded for an attempt.
-- name: ListAnswersByAttempt :many
SELECT * FROM answer
WHERE attempt_id = $1
ORDER BY question_id;
