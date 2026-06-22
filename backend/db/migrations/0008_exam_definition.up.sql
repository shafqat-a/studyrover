CREATE TABLE exam_definition (
    id              text PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subject_id      text NOT NULL REFERENCES subject (id) ON DELETE CASCADE,
    name            text NOT NULL,
    type            text NOT NULL DEFAULT 'gate',
    scope_topic_ids text[] NOT NULL DEFAULT '{}',
    size            int NOT NULL DEFAULT 20,
    pass_bar        int NOT NULL DEFAULT 70,
    cooldown_min    int NOT NULL DEFAULT 10,
    reward_style    text NOT NULL DEFAULT 'flat',
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT exam_definition_type_check CHECK (type IN ('gate', 'formal')),
    CONSTRAINT exam_definition_reward_style_check CHECK (reward_style IN ('flat', 'scaled')),
    CONSTRAINT exam_definition_size_check CHECK (size >= 1),
    CONSTRAINT exam_definition_pass_bar_check CHECK (pass_bar BETWEEN 0 AND 100),
    CONSTRAINT exam_definition_cooldown_min_check CHECK (cooldown_min >= 0)
);

CREATE INDEX exam_definition_subject_id_idx ON exam_definition (subject_id);
