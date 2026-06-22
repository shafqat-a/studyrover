-- 0015_jobs — Async job queue (contract 2-C03).
-- Postgres-backed queue driving ingest/syllabus/questions through
-- queued → processing → ready/error. Worker claims via FOR UPDATE SKIP LOCKED.
-- Fields: id, type(ingest|syllabus|questions), status(queued|processing|ready|error),
-- subjectId?, payload, result?, progress(0-100), error?, attempts, run_after,
-- createdAt, updatedAt.

CREATE TABLE job (
    id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    type       text        NOT NULL,
    status     text        NOT NULL DEFAULT 'queued',
    subject_id text        REFERENCES subject (id) ON DELETE CASCADE,
    payload    jsonb       NOT NULL DEFAULT '{}'::jsonb,
    result     jsonb,
    progress   integer     NOT NULL DEFAULT 0,
    error      text,
    attempts   integer     NOT NULL DEFAULT 0,
    run_after  timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- The worker polls for the oldest runnable queued job; index the claim predicate.
CREATE INDEX job_status_run_after_idx ON job (status, run_after);

-- Dashboard/clients list jobs by subject, newest first.
CREATE INDEX job_subject_id_created_at_idx ON job (subject_id, created_at DESC);
