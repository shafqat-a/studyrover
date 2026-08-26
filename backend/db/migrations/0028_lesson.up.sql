-- 0028 — Lessons: one class lesson per topic with enrichment resources.
--
-- lesson.markdown is the teaching body (AI-generated via the knowledge backend
-- or hand-edited); status gates student visibility. lesson_resource holds the
-- YouTube videos / Wikipedia articles / links attached by the Enrich job or by
-- the parent; (lesson_id, url) is unique so re-running Enrich never duplicates.

CREATE TABLE lesson (
    id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subject_id   text        NOT NULL REFERENCES subject (id) ON DELETE CASCADE,
    topic_id     text        NOT NULL UNIQUE REFERENCES topic (id) ON DELETE CASCADE,
    title        text        NOT NULL,
    markdown     text        NOT NULL DEFAULT '',
    status       text        NOT NULL DEFAULT 'draft',
    generated_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lesson_title_not_empty CHECK (length(title) > 0),
    CONSTRAINT lesson_status CHECK (status IN ('draft', 'published'))
);
CREATE INDEX lesson_subject_idx ON lesson (subject_id);

CREATE TABLE lesson_resource (
    id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    lesson_id     text        NOT NULL REFERENCES lesson (id) ON DELETE CASCADE,
    kind          text        NOT NULL,
    title         text        NOT NULL,
    url           text        NOT NULL,
    description   text,
    thumbnail_url text,
    external_id   text,
    position      integer     NOT NULL DEFAULT 0,
    source        text        NOT NULL DEFAULT 'manual',
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT lesson_resource_kind CHECK (kind IN ('youtube', 'wikipedia', 'link')),
    CONSTRAINT lesson_resource_source CHECK (source IN ('enrich', 'manual')),
    CONSTRAINT lesson_resource_url_not_empty CHECK (length(url) > 0),
    CONSTRAINT lesson_resource_unique_url UNIQUE (lesson_id, url)
);
CREATE INDEX lesson_resource_lesson_idx ON lesson_resource (lesson_id, position);
