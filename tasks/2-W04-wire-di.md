# 2-W04 — DI: wire knowledge adapter + worker

- **Wave:** 2-wiring (continuous) · **Module:** wiring · **Lang:** Go · **Depends on:** 2-F05, 2-F06, 2-F07, W04

## Owns
- Phase-2 composition in `backend/internal/app/wire.go` (extends W04): build `knowledge.Source` (selector), file storage, job queue + worker, inject into Handlers.

## Steps
1. Construct adapter from settings/config; pass storage + queue to ingest/gen/syllabus handlers; start worker with the app lifecycle.

## Acceptance
- [ ] App boots with Phase-2 deps; graceful shutdown stops the worker. Coordinated with W04/2-W02.
