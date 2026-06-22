# 2-T06 — E2E: ingest → syllabus → generate → approve

- **Wave:** 2-tests · **Module:** tests · **Lang:** TS/Playwright · **Depends on:** 2-P02, 2-P03, 2-P05

## Owns
- `frontend/e2e/authoring.spec.ts`

## Steps
1. Parent ingests a source → auto-suggests syllabus → applies → generates questions → approves drafts → they appear in the bank.

## Acceptance
- [ ] Full AI-authoring flow green (fake backend).
