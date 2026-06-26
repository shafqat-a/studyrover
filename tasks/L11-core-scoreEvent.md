# L11 — BuildScoreEvent

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C06, C10

## Owns
- `backend/internal/core/scoreevent.go`

## Steps
1. `func BuildScoreEvent(a ExamAttempt, def ExamDefinition, now time.Time) ScoreEvent` mapping score/passed/perTopic + subject/scope/size + RFC3339 timestamp.
2. No minutes/reward fields (Guardian-only).

## Acceptance
- [ ] Output matches C10 exactly; no reward fields. Covered by T04.
