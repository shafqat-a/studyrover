# T07 — E2E: student takes exam→result

- **Wave:** 4 · **Module:** tests · **Lang:** TS/Playwright · **Depends on:** P12, P13, P14

## Owns
- `frontend/e2e/take.spec.ts`

## Steps
1. Playwright: student signs in → starts exam → answers all → submits → sees score/pass/breakdown.
2. Assert no correct answers visible before submit; breakdown shown; no internet-time UI (Guardian off).

## Acceptance
- [ ] Green; verifies the Phase-1 study→score loop end to end.
