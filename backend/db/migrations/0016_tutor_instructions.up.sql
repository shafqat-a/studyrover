-- 0016_tutor_instructions — Per-subject tutor instructions (contract 2-C06).
-- Fields: subjectId(pk fk cascade), customInstructions, tone?, targetLanguage?, difficulty?.
-- One row per subject: subject_id is the primary key.

CREATE TABLE tutor_instructions (
    subject_id          text        PRIMARY KEY REFERENCES subject (id) ON DELETE CASCADE,
    custom_instructions text        NOT NULL,
    tone                text,
    target_language     text,
    difficulty          text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);
