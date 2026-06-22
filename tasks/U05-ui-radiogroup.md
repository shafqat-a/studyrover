# U05 — RadioGroup (MCQ)

- **Wave:** 2c · **Module:** ui · **Lang:** TS/React · **Depends on:** F07

## Goal
Core exam input (one choice) + reused in the question editor to mark the correct option.

## Owns
- `frontend/src/components/RadioGroup.tsx`

## Steps
1. `options:{id,label}[]`, value/onChange, name; optional `correctId`+`showResult` (review mode highlights right/wrong).
2. `role=radiogroup`, arrow-key nav, large tap targets (kid-friendly).

## Acceptance
- [ ] Single-select, keyboard navigable; review mode highlights; WCAG AA.
