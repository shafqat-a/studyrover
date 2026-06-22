# 2-D01 — Conversation + Message schema (0013)

- **Wave:** 2-db · **Module:** db · **Lang:** SQL · **Depends on:** F03, 2-C01

## Owns
- `backend/db/migrations/0013_conversation.up.sql` / `.down.sql`
- `backend/db/queries/conversation.sql`

## Steps
1. `conversation(id, subject_id fk, student_id fk, created_at)`; `message(id, conversation_id fk cascade, role, text, citations jsonb, created_at)`.
2. Queries: CreateConversation, GetConversation, AppendMessage, ListMessages.

## Acceptance
- [ ] migrate up + sqlc generate; matches 2-C01.
