# 3-H06 — useEarnedTime

- **Wave:** 3-hooks · **Module:** hooks · **Lang:** TS/React · **Depends on:** 3-W01

## Goal
Feeds the GuardianTimeSlot (3-U06) + captive portal: is the Guardian enabled, and what's the student's earned/remaining time.

## Owns
- `frontend/src/hooks/guardian/useEarnedTime.ts`

## Steps
1. `useGuardianEnabled()` (config/health probe) + `useEarnedTime(studentId)` (remaining from active grant).

## Acceptance
- [ ] Returns enabled flag + remaining; gracefully off when Guardian absent.
