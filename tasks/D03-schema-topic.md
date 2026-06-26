# D03 — Topic schema (0007)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C03

## Owns
- `backend/db/migrations/0007_topic.up.sql` / `.down.sql`
- `backend/db/queries/topic.sql`

## Steps
1. `topic(id, subject_id fk cascade, name, source_id? fk set null, page_start?, page_end?, "order" int, active bool default true)`.
2. Queries: CreateTopic, ListTopicsBySubject (ordered), GetTopic, UpdateTopic, DeleteTopic.

## Acceptance
- [ ] `migrate up` + `sqlc generate`; matches §C03.
