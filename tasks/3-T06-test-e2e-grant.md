# 3-T06 — E2E: pass → grant → time shows

- **Wave:** 3-tests · **Module:** tests · **Lang:** TS/Playwright · **Depends on:** 3-P04, 3-P05, 3-U06

## Owns
- `frontend/e2e/guardian.spec.ts`

## Steps
1. With Guardian enabled + fake wall: student passes an exam → device granted → captive portal shows remaining time → status page lists the active session → revoke works.

## Acceptance
- [ ] Full guardian loop green end-to-end (no hardware).
