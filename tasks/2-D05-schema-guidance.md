# 2-D05 — Parent guidance schema (0017)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03, 2-C07

## Owns
- `backend/db/migrations/0017_guidance.up.sql` / `.down.sql`
- `backend/db/queries/guidance.sql`

## Steps
1. `guidance(id, scope check(global|subject), subject_id? fk, text, created_at)`.
2. Queries: CreateGuidance, ListGuidance(scope/subject), DeleteGuidance.

## Acceptance
- [ ] migrate up + sqlc generate; matches 2-C07.
