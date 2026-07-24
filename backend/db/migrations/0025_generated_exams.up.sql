-- 0025 — generated exams: build an exam directly from LLM-authored questions,
-- pinned to an exact question set, without curating the reusable question bank.
--
-- question.generated marks an LLM-authored question that backs a generated exam;
-- such rows are created disabled + generated so they never appear in the bank
-- view or the bank-sampled exam pool.
ALTER TABLE question ADD COLUMN generated boolean NOT NULL DEFAULT false;

-- exam_definition.question_ids pins an exact, ordered question set. When
-- non-empty the attempt delivers exactly these questions (ignoring scope/size
-- sampling); when empty the exam samples the bank as before.
ALTER TABLE exam_definition ADD COLUMN question_ids text[] NOT NULL DEFAULT '{}';
