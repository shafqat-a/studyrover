-- 0019_mastery_snapshot — MasterySnapshot table (D07).
-- Point-in-time mastery readings per student+topic; feeds the dashboard timeline (2-C08).
-- Fields: id, student_id(fk), topic_id(fk), mastery(real), attempts(int), captured_at.

CREATE TABLE mastery_snapshot (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    student_id  text        NOT NULL REFERENCES student (id) ON DELETE CASCADE,
    topic_id    text        NOT NULL REFERENCES topic (id) ON DELETE CASCADE,
    mastery     real        NOT NULL DEFAULT 0,
    attempts    integer     NOT NULL DEFAULT 0,
    captured_at timestamptz NOT NULL DEFAULT now()
);

-- Dashboard timeline aggregation (2-L05): per-student, ordered by time, range-filtered.
CREATE INDEX mastery_snapshot_student_captured_at_idx ON mastery_snapshot (student_id, captured_at DESC);
