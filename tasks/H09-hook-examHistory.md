# H09 — useExamHistory / useProgress

- **Wave:** 2d · **Module:** hooks · **Lang:** TS/React · **Depends on:** W01

## Owns
- `frontend/src/hooks/useExamHistory.ts`

## Steps
1. `useExamHistory(studentId, subjectId?)` paginated GET `/attempts`; `useProgress(studentId)` GET `/progress`.

## Acceptance
- [ ] Typed; paginated; progress returns mastery+streak (no minutes).
