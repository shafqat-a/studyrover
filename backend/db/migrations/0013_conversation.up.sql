-- 0013_conversation — Conversation + Message tables (contract 2-C01, TutorChat).
-- Conversation{id, subjectId, studentId, createdAt}.
-- Message{id, conversationId, role(user|assistant), text, citations[], createdAt}.

CREATE TABLE conversation (
    id         text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    subject_id text        NOT NULL REFERENCES subject (id) ON DELETE CASCADE,
    student_id text        NOT NULL REFERENCES student (id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now()
);

-- Conversations are listed per subject/student, newest first.
CREATE INDEX conversation_subject_student_created_at_idx
    ON conversation (subject_id, student_id, created_at DESC);

CREATE TABLE message (
    id              text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    conversation_id text        NOT NULL REFERENCES conversation (id) ON DELETE CASCADE,
    role            text        NOT NULL,
    text            text        NOT NULL,
    citations       jsonb       NOT NULL DEFAULT '[]'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);

-- Messages are read in chronological order within a conversation.
CREATE INDEX message_conversation_created_at_idx
    ON message (conversation_id, created_at);
