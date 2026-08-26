-- 0027 — Guardian tables (Phase 3: reward engine + network wall).
--
-- All Guardian state is prefixed guardian_ and depends on the platform only
-- through student (FK) and score_event (read via the inbox cursor). Dropping
-- these tables leaves the Study Platform untouched.

-- Registered student devices, keyed by normalised MAC (lower-case, colons).
CREATE TABLE guardian_device (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    student_id  text        NOT NULL REFERENCES student (id) ON DELETE CASCADE,
    name        text        NOT NULL,
    mac         text        NOT NULL UNIQUE,
    ip          text,
    hostname    text,
    gated       boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT guardian_device_name_not_empty CHECK (length(name) > 0),
    CONSTRAINT guardian_device_mac_format CHECK (mac ~ '^([0-9a-f]{2}:){5}[0-9a-f]{2}$')
);
CREATE INDEX guardian_device_student_idx ON guardian_device (student_id);

-- Singleton Guardian-only policy knobs (rate/cap/pass bar live in settings).
CREATE TABLE guardian_policy (
    id                  text        PRIMARY KEY DEFAULT 'default',
    enabled             boolean     NOT NULL DEFAULT true,
    reward_style        text        NOT NULL DEFAULT 'flat',
    diminishing_returns boolean     NOT NULL DEFAULT true,
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT guardian_policy_style CHECK (reward_style IN ('flat', 'scaled'))
);
INSERT INTO guardian_policy (id) VALUES ('default');

-- Internet-time grants. A grant is active while revoked_at IS NULL and
-- expires_at > now(). wall_ref is the wall's own handle (e.g. RouterOS .id).
CREATE TABLE guardian_grant (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    device_id   text        NOT NULL REFERENCES guardian_device (id) ON DELETE CASCADE,
    student_id  text        NOT NULL,
    mac         text        NOT NULL,
    minutes     integer     NOT NULL,
    source      text        NOT NULL,
    attempt_id  text,
    reason      text,
    wall_ref    text,
    started_at  timestamptz NOT NULL DEFAULT now(),
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    CONSTRAINT guardian_grant_minutes_positive CHECK (minutes > 0),
    CONSTRAINT guardian_grant_source CHECK (source IN ('exam', 'manual'))
);
CREATE INDEX guardian_grant_active_idx ON guardian_grant (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX guardian_grant_student_started_idx ON guardian_grant (student_id, started_at DESC);

-- Per-student, per-day earned minutes + pass count (daily cap + diminishing returns).
CREATE TABLE guardian_daily_usage (
    student_id  text    NOT NULL REFERENCES student (id) ON DELETE CASCADE,
    day         date    NOT NULL,
    minutes     integer NOT NULL DEFAULT 0,
    passes      integer NOT NULL DEFAULT 0,
    PRIMARY KEY (student_id, day)
);

-- Idempotent inbox: one row per consumed score_event (the cursor = max id).
CREATE TABLE guardian_score_inbox (
    score_event_id bigint      PRIMARY KEY REFERENCES score_event (id) ON DELETE CASCADE,
    processed_at   timestamptz NOT NULL DEFAULT now(),
    minutes        integer     NOT NULL DEFAULT 0,
    grant_id       text        REFERENCES guardian_grant (id) ON DELETE SET NULL,
    note           text
);

-- Every parent override (manual grant / revoke) is logged.
CREATE TABLE guardian_override_log (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    device_id   text        NOT NULL,
    device_name text        NOT NULL,
    minutes     integer     NOT NULL,
    reason      text,
    who         text        NOT NULL,
    at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX guardian_override_log_at_idx ON guardian_override_log (at DESC);
