# D01 — Subject schema (0005)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C01

## Owns
- `backend/db/migrations/0005_subject.up.sql` / `.down.sql`
- `backend/db/queries/subject.sql`

## Reads
- `tasks/CONTRACTS.md` §C01

## Steps
1. `subject(id, name, color?, icon?, description?, archived bool default false, created_at)`.
2. Queries: CreateSubject, GetSubject, ListSubjects (paginated, filter archived), UpdateSubject, DeleteSubject, CountSubjects.

## Acceptance
- [ ] `migrate up` + `sqlc generate`; matches §C01.
> Convention: child tables reference `subject_id` with `on delete cascade`.
