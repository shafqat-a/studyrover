-- 0014_study_guide — StudyGuide table (contract 2-C02).
-- Fields: id, subjectId(req fk), topicId?(fk), markdown, citations(jsonb), generatedAt.

CREATE TABLE study_guide (
    id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subject_id   text        NOT NULL REFERENCES subject (id) ON DELETE CASCADE,
    topic_id     text        REFERENCES topic (id) ON DELETE CASCADE,
    markdown     text        NOT NULL DEFAULT '',
    citations    jsonb       NOT NULL DEFAULT '[]'::jsonb,
    generated_at timestamptz NOT NULL DEFAULT now()
);

-- One guide per (subject, topic). topic_id NULL represents the subject-level guide;
-- a partial unique index handles each case so upsert can target the right row.
CREATE UNIQUE INDEX study_guide_subject_topic_idx
    ON study_guide (subject_id, topic_id)
    WHERE topic_id IS NOT NULL;
CREATE UNIQUE INDEX study_guide_subject_idx
    ON study_guide (subject_id)
    WHERE topic_id IS NULL;
