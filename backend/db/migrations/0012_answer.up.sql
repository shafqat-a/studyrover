-- 0012_answer — one answer per question within an exam attempt (contract C06).
-- Answers are written as a batch when an attempt is submitted; there is at
-- most one answer per (attempt, question), enforced by a unique constraint.
-- Child of exam_attempt (ON DELETE CASCADE) and question.

CREATE TABLE answer (
    id                 text    PRIMARY KEY DEFAULT gen_random_uuid()::text,
    attempt_id         text    NOT NULL REFERENCES exam_attempt (id) ON DELETE CASCADE,
    question_id        text    NOT NULL REFERENCES question (id),
    selected_option_id text,
    correct            boolean,
    UNIQUE (attempt_id, question_id)
);

-- Answers are listed/loaded per attempt when grading and showing results.
CREATE INDEX answer_attempt_id_idx ON answer (attempt_id);
