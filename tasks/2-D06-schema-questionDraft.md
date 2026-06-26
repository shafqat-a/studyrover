# 2-D06 — QuestionDraft schema (0018)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03, 2-C05

## Owns
- `backend/db/migrations/0018_question_draft.up.sql` / `.down.sql`
- `backend/db/queries/question_draft.sql`

## Steps
1. `question_draft(id, subject_id fk, topic_id? fk, text, options jsonb, correct_option_index int, difficulty, status default 'pending', created_at)`.
2. Queries: InsertDrafts (batch), ListDrafts(status), GetDraft, SetStatus.

## Acceptance
- [ ] migrate up + sqlc generate; supports gen→review→approve.
