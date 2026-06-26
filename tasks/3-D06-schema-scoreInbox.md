# 3-D06 — ScoreEvent inbox schema (g0007)

- **Wave:** 3-db · **Module:** db · **Lang:** SQL · **Depends on:** 3-D07

## Owns
- `guardian/db/migrations/g0007_score_inbox.up.sql` / `.down.sql`
- `guardian/db/queries/score_inbox.sql`

## Steps
1. `score_event_inbox(event_id pk, attempt_id, processed_at, grant_id?)` + a `cursor` row/table for the subscriber.
2. Queries: SeenEvent, MarkProcessed, GetCursor, SetCursor.

## Acceptance
- [ ] migrate up + sqlc generate; enables idempotent, resumable subscription (3-F02).
