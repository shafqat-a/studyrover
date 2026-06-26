# P13 — Exam in progress (screen 3.4)

- **Wave:** 3 · **Module:** pages · **Lang:** TS/React · **Depends on:** H08, U05, U01, U19, U15

## Owns
- `frontend/src/pages/ExamRun.tsx`

## Steps
1. Load attempt (H08); render question + options (U05, no correct answer). Next/prev/jump + progress (U15). Submit with confirm (U19) → `useSubmitAttempt` → route to P14. Optional timer.

## Acceptance
- [ ] Collects one answer/question; never shows correctness; submit grades + routes. Matches screen 3.4.
