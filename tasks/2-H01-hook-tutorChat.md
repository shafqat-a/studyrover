# 2-H01 — useTutorChat (SSE)

- **Wave:** 2-hooks · **Module:** hooks · **Lang:** TS/React · **Depends on:** 2-W01

## Owns
- `frontend/src/hooks/useTutorChat.ts`

## Steps
1. Start conversation, send message, consume SSE `AnswerChunk` stream (EventSource/fetch-stream), accumulate assistant message + citations.

## Acceptance
- [ ] Streams tokens into state; typed; handles disconnect. Powers 2-P01.
