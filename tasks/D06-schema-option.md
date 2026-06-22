# D06 — Option schema (0010)

- **Wave:** 1 · **Module:** db · **Lang:** SQL · **Depends on:** F03, C05

## Owns
- `backend/db/migrations/0010_option.up.sql` / `.down.sql`
- `backend/db/queries/option.sql`

## Steps
1. `option(id, question_id fk cascade, text, "order" int)`.
2. Queries: CreateOption, ListOptionsByQuestion, ListOptionsByQuestionIDs (batch for assembly), DeleteOptionsByQuestion.

## Acceptance
- [ ] Cascade on question delete; batch fetch supports exam assembly; `sqlc generate` succeeds.
