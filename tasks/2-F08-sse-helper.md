# 2-F08 — SSE streaming helper

- **Wave:** 2-foundation · **Module:** http · **Lang:** Go · **Depends on:** F02

## Goal
Server-Sent Events helper for streaming tutor answers (2-A02) and optional job progress (2-A06).

## Owns
- `backend/internal/httputil/sse.go` (`Stream(w, ch)`, flush, heartbeat, client-disconnect handling)

## Steps
1. Set SSE headers; serialize `AnswerChunk`/progress events; flush per chunk; stop on ctx cancel.

## Acceptance
- [ ] Streams chunks incrementally; cleans up on disconnect. Used by 2-A02.
