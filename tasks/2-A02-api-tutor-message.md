# 2-A02 — POST /tutor/conversations/{id}/messages (SSE)

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D01, 2-F05, 2-F08, 2-L01, 2-L06

## Goal
Stream a grounded tutor answer.

## Owns
- `backend/internal/http/tutor_message.go`

## Steps
1. Validate `AskRequest`; build prompt (2-L01); call `knowledge.AnswerGrounded`; stream `AnswerChunk` via SSE (2-F08); persist user + assistant messages with citations (2-L06).

## Acceptance
- [ ] Streams incrementally; persists turn; citations attached. Covered by 2-T05 (fake backend).
