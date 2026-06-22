# P12 — Start exam (screen 3.3)

- **Wave:** 3 · **Module:** pages · **Lang:** TS/React · **Depends on:** H08, H04, U03, U01

## Owns
- `frontend/src/pages/ExamStart.tsx`

## Steps
1. Select exam/scope (H04 defs or "current topic"); size 5/10/20 (default 20). Time-per-option hidden Phase 1. "Start" → `useStartAttempt` → route to P13.
2. Cooldown (409) → show cooldown message instead of starting.

## Acceptance
- [ ] Starts attempt, navigates to in-progress; handles cooldown. Matches screen 3.3.
