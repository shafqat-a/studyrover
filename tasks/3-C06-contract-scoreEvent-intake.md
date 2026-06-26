# 3-C06 — ScoreEvent intake contract

- **Wave:** 3-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** C10

## Owns
- `contracts/components/guardian/intake.yaml` (references the platform `ScoreEvent` C10; documents the consumed shape)

## Steps
1. `$ref` the platform ScoreEvent; define the inbox record `{eventId, processedAt, grantId?}` for status/debug.

## Acceptance
- [ ] Valid 3.1; reuses C10 (no redefinition); codegen emits types.
> The seam: Guardian consumes C10 only.
