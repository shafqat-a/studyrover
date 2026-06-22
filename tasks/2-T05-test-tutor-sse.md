# 2-T05 — Tutor chat SSE integration

- **Wave:** 2-tests · **Module:** tests · **Lang:** Go · **Depends on:** 2-A01, 2-A02, 2-A03

## Owns
- `backend/internal/http/tutor_test.go`

## Steps
1. Start conversation → POST message → consume SSE chunks (fake backend) → assert assistant message + citations persisted.

## Acceptance
- [ ] SSE streaming + persistence green with fake adapter.
