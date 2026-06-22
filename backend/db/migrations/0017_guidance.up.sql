-- 0017_guidance — Parent guidance to the tutor (contract 2-C07).
-- Fields: id, scope(global|subject), subjectId?(fk subject), text(req), createdAt.

CREATE TABLE guidance (
    id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    scope      text        NOT NULL CHECK (scope IN ('global', 'subject')),
    subject_id text        REFERENCES subject (id) ON DELETE CASCADE,
    text       text        NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Listing is filtered by scope/subject, newest first.
CREATE INDEX guidance_scope_subject_id_created_at_idx ON guidance (scope, subject_id, created_at DESC);
