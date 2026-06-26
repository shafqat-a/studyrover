# 2-F05 — Knowledge adapter selector + config

- **Wave:** 2-foundation · **Module:** knowledge · **Lang:** Go · **Depends on:** 2-F02, 2-F03, 2-F04

## Goal
Pick the active `Source` impl from Settings (`knowledgeBackend`) + config; provide it for DI. Includes a simple cost/rate guard.

## Owns
- `backend/internal/knowledge/selector.go` (`New(settings, cfg) Source`)
- `backend/internal/knowledge/guard.go` (per-day call/cost cap)

## Steps
1. Map `notebooklm`→2-F03, `gemini`→2-F04 fallback→fake when no key.
2. Wrap chosen impl with the rate/cost guard.

## Acceptance
- [ ] Returns the configured backend; falls back to fake without credentials; guard caps runaway calls.
