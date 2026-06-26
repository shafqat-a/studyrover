# T06 — E2E: parent builds subject→exam

- **Wave:** 4 · **Module:** tests · **Lang:** TS/Playwright · **Depends on:** P04, P08, P09

## Owns
- `frontend/e2e/build.spec.ts`

## Steps
1. Playwright: parent creates subject → adds topic → adds ≥5 questions → defines a gate exam. Assert each persists/visible.

## Acceptance
- [ ] Green against the running app (seeded/clean DB).
