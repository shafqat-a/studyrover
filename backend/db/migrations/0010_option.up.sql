-- 0010_option — Option table (contract C05).
-- An option belongs to a question; deleting the question cascades its options.
-- Fields: id, question_id (fk cascade), text, order.

CREATE TABLE option (
    id          text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    question_id text        NOT NULL REFERENCES question (id) ON DELETE CASCADE,
    text        text        NOT NULL,
    "order"     integer     NOT NULL DEFAULT 0
);

-- Options are fetched per question (and batched by question id for exam
-- assembly), ordered by their position.
CREATE INDEX option_question_id_order_idx ON option (question_id, "order");
