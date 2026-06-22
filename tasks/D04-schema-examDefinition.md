# D04 — ExamDefinition schema (0008)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C04

## Owns
- `backend/db/migrations/0008_exam_definition.up.sql` / `.down.sql`
- `backend/db/queries/exam_definition.sql`

## Steps
1. `exam_definition(id, subject_id fk cascade, name, type text default 'gate', scope_topic_ids text[] default '{}', size int default 20, pass_bar int default 70, cooldown_min int default 10, reward_style text default 'flat', created_at)` with CHECK constraints + `size>=1`, `pass_bar between 0 and 100`.
2. Queries: CreateExamDefinition, ListBySubject (paginated), Get, Update, Delete.

## Acceptance
- [ ] DB defaults match spec §10; `sqlc generate` succeeds.
