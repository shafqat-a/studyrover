# 2-D04 — TutorInstructions schema (0016)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03, 2-C06

## Owns
- `backend/db/migrations/0016_tutor_instructions.up.sql` / `.down.sql`
- `backend/db/queries/tutor_instructions.sql`

## Steps
1. `tutor_instructions(subject_id pk fk cascade, custom_instructions, tone?, target_language?, difficulty?)`.
2. Queries: GetBySubject, Upsert.

## Acceptance
- [ ] migrate up + sqlc generate; one row per subject.
