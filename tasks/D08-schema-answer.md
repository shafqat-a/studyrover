# D08 — Answer schema (0012)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C06

## Owns
- `backend/db/migrations/0012_answer.up.sql` / `.down.sql`
- `backend/db/queries/answer.sql`

## Steps
1. `answer(id, attempt_id fk cascade, question_id fk, selected_option_id?, correct bool?, unique(attempt_id, question_id))`.
2. Queries: InsertAnswers (batch), ListAnswersByAttempt.

## Acceptance
- [ ] One answer per question per attempt; batch insert for submit; `sqlc generate` succeeds.
