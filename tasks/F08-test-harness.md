# F08 — Test harness (Go test + Vitest + Playwright)

- **Wave:** 0 · **Module:** foundation · **Lang:** Go/TS · **Depends on:** F02, F03, F04, F05

## Goal
Provide shared test setup for all three test layers so T-tasks just work.

## Owns
- `backend/internal/testutil/db.go` (spin a test Postgres via testcontainers-go or a `TEST_DATABASE_URL`; migrate; truncate helpers)
- `frontend/vitest.config.ts`, `frontend/src/test/setup.ts` (RTL + jsdom)
- `frontend/playwright.config.ts` (webServer = built SPA served by backend, or dev server)

## Steps
1. Go integration tests get an isolated migrated DB via `testutil`.
2. Vitest + RTL for component tests; Playwright for E2E (T06/T07).

## Acceptance
- [ ] `go test ./...` and `pnpm --dir frontend test` both run.
- [ ] Playwright boots the app (placeholder spec OK).
