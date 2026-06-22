# 2-D08 — FileBlob metadata schema (0020)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03

## Owns
- `backend/db/migrations/0020_file_blob.up.sql` / `.down.sql`
- `backend/db/queries/file_blob.sql`

## Steps
1. `file_blob(id, ref unique, filename, content_type, size_bytes, created_at)` — metadata for files stored by 2-F07.
2. Queries: CreateBlob, GetBlob, DeleteBlob.

## Acceptance
- [ ] migrate up + sqlc generate; `ref` links to storage.
