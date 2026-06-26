# 2-T01 — Knowledge adapter contract tests

- **Wave:** 2-tests · **Module:** tests · **Lang:** Go · **Depends on:** 2-F04

## Owns
- `backend/internal/knowledge/contract_test.go`

## Steps
1. A shared test suite run against the fake (and optionally gemini/notebooklm with credentials) asserting all `Source` methods behave per the interface.

## Acceptance
- [ ] Fake passes the suite; the suite is reusable for real impls.
