# C10 — ScoreEvent schema (the cross-boundary seam)

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06, C06

## Goal
The single interface the future Guardian (Phase 3) consumes. Phase 1 produces it and stops (spec §4, §14).

## Owns
- `contracts/components/scoreEvent.yaml`

## Reads
- `tasks/CONTRACTS.md` §C10

## Steps
1. `ScoreEvent` exactly per §C10; `$ref` `PerTopicScore` from `attempt.yaml` (do not redefine).
2. Document: no minutes/reward fields — Guardian-only.

## Acceptance
- [ ] Matches §C10 exactly; no reward fields; codegen emits Go + TS.
