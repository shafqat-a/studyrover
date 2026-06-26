# 2-D07 — MasterySnapshot schema (0019)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03, C06

## Owns
- `backend/db/migrations/0019_mastery_snapshot.up.sql` / `.down.sql`
- `backend/db/queries/mastery_snapshot.sql`

## Steps
1. `mastery_snapshot(id, student_id fk, topic_id fk, mastery real, attempts int, captured_at)` — feeds the dashboard timeline.
2. Queries: InsertSnapshot, ListByStudent(range), LatestByStudent.

## Acceptance
- [ ] migrate up + sqlc generate; supports 2-L05 dashboard aggregation.
