-- 0018_question_draft — AI-generated question drafts (contract 2-C05).
--
-- Generated questions are drafts requiring parent review before entering the
-- live question bank. A draft references the subject it belongs to and may
-- optionally reference a topic. `options` is a JSON array of {text} objects and
-- `correct_option_index` indexes into that array.
--
-- subject_id cascades on delete (a draft cannot outlive its subject).
-- topic_id is nullable and set null on delete (a draft survives its topic).
-- status drives the gen → review → approve/reject lifecycle.

CREATE TABLE question_draft (
    id                   text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subject_id           text        NOT NULL REFERENCES subject (id) ON DELETE CASCADE,
    topic_id             text        REFERENCES topic (id) ON DELETE SET NULL,
    text                 text        NOT NULL,
    options              jsonb       NOT NULL DEFAULT '[]'::jsonb,
    correct_option_index integer     NOT NULL DEFAULT 0,
    difficulty           text,
    status               text        NOT NULL DEFAULT 'pending',
    created_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT question_draft_text_not_empty CHECK (length(text) > 0),
    CONSTRAINT question_draft_correct_index_nonneg CHECK (correct_option_index >= 0),
    CONSTRAINT question_draft_status_valid CHECK (status IN ('pending', 'approved', 'rejected'))
);

-- Drafts are reviewed by status, newest first.
CREATE INDEX question_draft_status_created_at_idx ON question_draft (status, created_at DESC);
CREATE INDEX question_draft_subject_id_idx ON question_draft (subject_id);
CREATE INDEX question_draft_topic_id_idx ON question_draft (topic_id);
