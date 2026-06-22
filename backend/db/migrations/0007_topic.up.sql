-- D03 — Topic schema (0007)
--
-- A unit of study within a subject. May optionally point at a source and a page
-- range. `order` controls syllabus position; `active` toggles whether the topic
-- is in scope for exams. Matches CONTRACTS.md §C03.
--
-- subject_id cascades on delete (a topic cannot outlive its subject).
-- source_id is nullable and set null on delete (a topic survives its source).

CREATE TABLE topic (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subject_id  text        NOT NULL REFERENCES subject (id) ON DELETE CASCADE,
    name        text        NOT NULL,
    source_id   text        REFERENCES source (id) ON DELETE SET NULL,
    page_start  integer,
    page_end    integer,
    "order"     integer     NOT NULL DEFAULT 0,
    active      boolean     NOT NULL DEFAULT true,
    CONSTRAINT topic_name_not_empty CHECK (length(name) > 0),
    CONSTRAINT topic_page_start_positive CHECK (page_start IS NULL OR page_start >= 1),
    CONSTRAINT topic_page_end_positive CHECK (page_end IS NULL OR page_end >= 1),
    CONSTRAINT topic_page_range CHECK (
        page_start IS NULL OR page_end IS NULL OR page_end >= page_start
    )
);

CREATE INDEX topic_subject_id_idx ON topic (subject_id);
CREATE INDEX topic_subject_order_idx ON topic (subject_id, "order");
CREATE INDEX topic_source_id_idx ON topic (source_id);
