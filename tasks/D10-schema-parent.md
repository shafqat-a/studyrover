# D10 — Parent + Credential schema (0002)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C08

## Owns
- `backend/db/migrations/0002_parent.up.sql` / `.down.sql`
- `backend/db/queries/parent.sql`

## Reads
- `tasks/CONTRACTS.md` §C08

## Steps
1. `parent(id, display_name, email unique, created_at)`; `credential(id, parent_id fk, credential_id unique, public_key, counter int, is_backup bool default false)`.
2. sqlc queries: CreateParent, GetParentByEmail, AddCredential, ListCredentialsByParent, UpdateCredentialCounter.

## Acceptance
- [ ] `migrate up` + `sqlc generate` succeed; supports multiple credentials incl. backup.
