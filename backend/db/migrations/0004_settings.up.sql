CREATE TABLE settings (
    id                     text PRIMARY KEY DEFAULT 'singleton',
    reward_rate_min_per_q  int NOT NULL DEFAULT 3,
    daily_cap_hours        int NOT NULL DEFAULT 3,
    default_exam_size      int NOT NULL DEFAULT 20,
    default_pass_bar       int NOT NULL DEFAULT 70,
    default_cooldown_min   int NOT NULL DEFAULT 10,
    knowledge_backend      text NOT NULL DEFAULT 'notebooklm',
    difficulty_ramp        boolean NOT NULL DEFAULT false,
    CONSTRAINT settings_singleton_check CHECK (id = 'singleton'),
    CONSTRAINT settings_knowledge_backend_check CHECK (knowledge_backend IN ('notebooklm', 'gemini')),
    CONSTRAINT settings_default_exam_size_check CHECK (default_exam_size >= 1),
    CONSTRAINT settings_default_pass_bar_check CHECK (default_pass_bar BETWEEN 0 AND 100),
    CONSTRAINT settings_default_cooldown_min_check CHECK (default_cooldown_min >= 0)
);
