-- 0005_subject — Subject table (contract C01).
-- Fields: id, name(req), color?, icon?, description?, archived(default false), createdAt.

CREATE TABLE subject (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        text        NOT NULL,
    color       text,
    icon        text,
    description text,
    archived    boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- Listing is paginated and commonly filtered by archived, newest first.
CREATE INDEX subject_archived_created_at_idx ON subject (archived, created_at DESC);
