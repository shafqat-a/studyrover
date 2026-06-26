# D09 — Student schema (0003)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C07

## Owns
- `backend/db/migrations/0003_student.up.sql` / `.down.sql`
- `backend/db/queries/student.sql`

## Reads
- `tasks/CONTRACTS.md` §C07

## Steps
1. `student(id, name, grade_level?, avatar_url?, notes?, pin_hash?, created_at)`.
2. Queries: GetStudent (single-student Phase 1), UpsertStudent, GetStudentByID.

## Acceptance
- [ ] `migrate up` + `sqlc generate` succeed; matches §C07.
