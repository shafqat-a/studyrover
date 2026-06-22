# D02 — Source schema (0006)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C02

## Owns
- `backend/db/migrations/0006_source.up.sql` / `.down.sql`
- `backend/db/queries/source.sql`

## Steps
1. `source(id, subject_id fk cascade, type text check(file|notebooklm|text), title, status text default 'ready' check(processing|ready), file_ref?, url?, text?, created_at)`.
2. Queries: CreateSource, ListSourcesBySubject (paginated), GetSource, DeleteSource.

## Acceptance
- [ ] `migrate up` + `sqlc generate`; matches §C02.
