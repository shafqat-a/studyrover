# D07 — ExamAttempt schema (0011)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C06

## Owns
- `backend/db/migrations/0011_exam_attempt.up.sql` / `.down.sql`
- `backend/db/queries/exam_attempt.sql`

## Steps
1. `exam_attempt(id, exam_definition_id fk, student_id fk, status text default 'in_progress', question_ids text[], score_pct int?, passed bool?, per_topic jsonb?, cooldown_until timestamptz?, started_at default now(), submitted_at?)`.
2. Queries: CreateAttempt, GetAttempt, MarkSubmitted (set graded fields), ListByStudent (paginated), GetLastFailedForExam (cooldown check).

## Acceptance
- [ ] `migrate up` + `sqlc generate`; supports start/submit/result/history + cooldown lookup.
