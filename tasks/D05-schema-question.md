# D05 — Question schema (0009)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C05

## Owns
- `backend/db/migrations/0009_question.up.sql` / `.down.sql`
- `backend/db/queries/question.sql`

## Steps
1. `question(id, subject_id fk cascade, topic_id? fk set null, text, correct_option_id text, difficulty text default 'medium', enabled bool default true, created_at)`.
2. Queries: CreateQuestion, GetQuestion, ListBySubject/Topic (paginated), ListEligibleForExam (enabled + scope), Update, Delete. (Options are D06.)

## Acceptance
- [ ] `migrate up` + `sqlc generate`; matches §C05. `ListEligibleForExam` supports L04 assembly.
