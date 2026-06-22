# 2-A01 — POST /tutor/conversations

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D01, F09

## Owns
- `backend/internal/http/tutor_conversations.go`

## Steps
1. `TutorConversationCreate`: `{subjectId, studentId}` → new `Conversation`. Student or parent guarded.

## Acceptance
- [ ] Creates conversation; validated. Covered by 2-T05.
