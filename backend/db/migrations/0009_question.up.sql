-- D05 — Question schema (0009)
-- A question belongs to a subject (cascade) and optionally a topic (set null).
-- Options live in their own table (D06, 0010); correct_option_id stores the
-- chosen option id as text (server-assigned). difficulty is one of the C05
-- Difficulty enum values; enabled toggles eligibility for exam assembly.

CREATE TABLE question (
    id                  text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subject_id          text        NOT NULL REFERENCES subject (id) ON DELETE CASCADE,
    topic_id            text        REFERENCES topic (id) ON DELETE SET NULL,
    text                text        NOT NULL,
    correct_option_id   text        NOT NULL,
    difficulty          text        NOT NULL DEFAULT 'medium'
                            CHECK (difficulty IN ('easy', 'medium', 'hard')),
    enabled             boolean     NOT NULL DEFAULT true,
    created_at          timestamptz NOT NULL DEFAULT now()
);

-- Bank lookups: list/select by subject, optionally narrowed to a topic, and
-- eligibility filtering for exam assembly (L04 / L08) hit (subject, topic,
-- enabled) frequently.
CREATE INDEX question_subject_id_idx ON question (subject_id);
CREATE INDEX question_topic_id_idx ON question (topic_id);
CREATE INDEX question_eligible_idx ON question (subject_id, topic_id, enabled);
