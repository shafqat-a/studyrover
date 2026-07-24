-- 0023 — syllabus: the curriculum grouping above subjects.
--
-- An education-system syllabus like "Class V" collects the subjects taught at
-- that level ("Math Class V", "Science Class V", ...). Subjects reference their
-- syllabus optionally so existing/ungrouped subjects keep working; deleting a
-- syllabus un-groups its subjects rather than deleting them.
CREATE TABLE syllabus (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    name        text        NOT NULL,
    description text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT syllabus_name_not_empty CHECK (length(name) > 0)
);

ALTER TABLE subject
    ADD COLUMN syllabus_id text REFERENCES syllabus (id) ON DELETE SET NULL;

-- Subjects are commonly listed grouped by syllabus.
CREATE INDEX subject_syllabus_id_idx ON subject (syllabus_id);
