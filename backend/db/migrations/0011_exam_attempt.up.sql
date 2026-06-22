-- 0011_exam_attempt — ExamAttempt table (contract C06).
-- Fields: id, examDefinitionId(fk), studentId(fk), status(default in_progress),
--   questionIds(text[]), scorePct?, passed?, perTopic?(jsonb), cooldownUntil?,
--   startedAt(default now), submittedAt?.
-- Answers live in a separate table (0012_answer); graded fields are filled on submit.

CREATE TABLE exam_attempt (
    id                 text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    exam_definition_id text        NOT NULL REFERENCES exam_definition (id) ON DELETE CASCADE,
    student_id         text        NOT NULL REFERENCES student (id) ON DELETE CASCADE,
    status             text        NOT NULL DEFAULT 'in_progress',
    question_ids       text[]      NOT NULL DEFAULT '{}',
    score_pct          integer,
    passed             boolean,
    per_topic          jsonb,
    cooldown_until     timestamptz,
    started_at         timestamptz NOT NULL DEFAULT now(),
    submitted_at       timestamptz
);

-- History is paginated per student, newest first.
CREATE INDEX exam_attempt_student_started_at_idx ON exam_attempt (student_id, started_at DESC);

-- Cooldown lookup: most recent failed attempt for a student on a given exam.
CREATE INDEX exam_attempt_exam_student_idx ON exam_attempt (exam_definition_id, student_id, submitted_at DESC);
