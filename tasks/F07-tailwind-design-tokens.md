# F07 — Tailwind + design tokens (frontend)

- **Wave:** 0 · **Module:** foundation · **Lang:** TS/CSS · **Depends on:** F05

## Goal
Tailwind with design tokens (color, spacing, radius, type) so every component looks consistent and kid-friendly.

## Owns
- `frontend/tailwind.config.ts` (tokens; content globs `src/**`)
- `frontend/postcss.config.js`
- `frontend/src/styles/globals.css` (`@tailwind` layers + CSS vars)

## Steps
1. Define accessible token palette + scales.
2. Import `globals.css` in `main.tsx` (F05 entry).

## Acceptance
- [ ] A token class renders styled; `pnpm --dir frontend build` succeeds with Tailwind active.
