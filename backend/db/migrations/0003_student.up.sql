-- 0003_student — Student table (contract C07).
-- Fields: id, name, grade_level?, avatar_url?, notes?, pin_hash?, created_at.
-- Phase 1 is single-student; pin_hash backs optional student sign-in (A20).

CREATE TABLE student (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        text        NOT NULL,
    grade_level text,
    avatar_url  text,
    notes       text,
    pin_hash    text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Single-student Phase 1 helper: newest first when fetching the one profile.
CREATE INDEX student_created_at_idx ON student (created_at DESC);
