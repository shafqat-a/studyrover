-- 0026 — ScoreEvent outbox (CONTRACTS C10 / CONTRACTS-P3 "the seam").
--
-- Every graded exam submission appends one immutable row here. This table is
-- the ONLY thing the Phase-3 Guardian reads from the Study Platform: it polls
-- rows with id > its cursor, decides internet minutes, and records the result
-- in guardian_score_inbox. Monotonic bigserial id = the cursor.

CREATE TABLE score_event (
    id                 bigserial   PRIMARY KEY,
    attempt_id         text        NOT NULL UNIQUE REFERENCES exam_attempt (id) ON DELETE CASCADE,
    student_id         text        NOT NULL,
    subject_id         text        NOT NULL,
    exam_definition_id text        NOT NULL,
    scope_topic_ids    text[]      NOT NULL DEFAULT '{}',
    size               integer     NOT NULL,
    score_pct          integer     NOT NULL,
    passed             boolean     NOT NULL,
    per_topic          jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT score_event_score_pct_range CHECK (score_pct BETWEEN 0 AND 100)
);

CREATE INDEX score_event_student_created_idx ON score_event (student_id, created_at DESC);
