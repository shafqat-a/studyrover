# 3-W03 — Frontend: Guardian routes + gating

- **Wave:** 3-wiring (continuous) · **Module:** wiring · **Lang:** TS/React · **Depends on:** 3-P01..3-P06, 3-U*, 3-H*, W03

## Owns
- Guardian additions to `frontend/src/app/router.tsx`, `components/guardian/index.ts`, `hooks/guardian/index.ts`

## Steps
1. Register guardian pages + portal route; gate the whole Guardian section behind `useGuardianEnabled` (3-H06); ensure 3-U06 slot resolves into the Phase-1 placeholders.

## Acceptance
- [ ] Guardian routes resolve only when enabled; time UI lights up; `pnpm build` green.
