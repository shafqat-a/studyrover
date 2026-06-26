# 2-W01 — OpenAPI: add Phase-2 paths + components

- **Wave:** 2-wiring (continuous) · **Module:** wiring · **Lang:** OpenAPI · **Depends on:** 2-C01..2-C08, W01

## Owns
- Phase-2 additions to `contracts/openapi.yaml` paths + `$ref`s (extends W01's root)

## Steps
1. Add all 2-A* paths (incl. SSE response media `text/event-stream`) referencing Phase-2 components; regen Go + TS.

## Acceptance
- [ ] `make gen` compiles; Phase-2 client/types available; gen-drift check passes.
> Coordinate with W01 (same root file): W01/2-W01/3-W01 are the same owner role — run sequentially, never concurrently editing `openapi.yaml`.
