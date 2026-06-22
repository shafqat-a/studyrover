# H08 — useExamAttempt (start/submit)

- **Wave:** 2d · **Module:** hooks · **Lang:** TS/React · **Depends on:** W01

## Goal
Student exam-loop hooks: start, fetch in-progress, submit, fetch result.

## Owns
- `frontend/src/hooks/useExamAttempt.ts`

## Steps
1. `useStartAttempt()` POST `/attempts`; `useAttempt(id)` GET; `useSubmitAttempt(id)` POST submit; `useAttemptResult(id)` GET result.
2. Handle 409 cooldown explicitly (surface `cooldownUntil`).

## Acceptance
- [ ] Typed; never expects `correctOptionId` pre-submit; surfaces cooldown. Powers P12–P14.
