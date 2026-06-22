# 3-W01 — OpenAPI: Guardian namespace + codegen

- **Wave:** 3-wiring (continuous) · **Module:** wiring · **Lang:** OpenAPI · **Depends on:** 3-C01..3-C06, W01

## Owns
- Guardian paths/components in `contracts/openapi.yaml` (tag `guardian`) + codegen to `guardian/internal/contracts` + `frontend/src/api`

## Steps
1. Add all 3-A* paths + guardian components; generate Go (for the guardian module) + TS client; portal routes documented.

## Acceptance
- [ ] `make gen` compiles guardian Go + TS; gen-drift passes.
> Same single-owner role as W01/2-W01 for `openapi.yaml` — never edit concurrently.
