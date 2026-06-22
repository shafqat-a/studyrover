# 3-U06 — GuardianTimeSlot

- **Wave:** 3-ui · **Module:** ui · **Lang:** TS/React · **Depends on:** F07, 3-H06, 3-U07

## Goal
The component that fills the `<GuardianTimeSlot/>` placeholder the Phase-1 student pages already render — lights up earned/remaining time only when the Guardian is enabled.

## Owns
- `frontend/src/components/guardian/GuardianTimeSlot.tsx`

## Steps
1. If Guardian enabled (3-H06), show earned/remaining time + "go online"; else render nothing. No edits to Phase-1 pages.

## Acceptance
- [ ] Dark when Guardian off; shows time when on. The agreed forward-hook (CONTRACTS-P3).
