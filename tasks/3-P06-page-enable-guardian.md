# 3-P06 — Enable Guardian + time UI

- **Wave:** 3-pages · **Module:** pages · **Lang:** TS/React · **Depends on:** 3-H06, 3-U06

## Goal
Settings toggle to enable/disable the Guardian, and confirm the time UI lights up across the student flow via the slot (3-U06) — without editing Phase-1 page files.

## Owns
- `frontend/src/pages/guardian/EnableGuardian.tsx`

## Steps
1. Enable/disable Guardian (config) + status indicator; document that 3-U06 fills the Phase-1 `<GuardianTimeSlot/>` placeholders when enabled.

## Acceptance
- [ ] Toggling Guardian lights up earned/remaining time in P11/P12/P14 via the slot. No Phase-1 page edits.
