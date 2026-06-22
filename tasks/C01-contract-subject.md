# C01 — Subject schema

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/subject.yaml`

## Reads
- `tasks/CONTRACTS.md` §C01

## Steps
1. Define `Subject`, `CreateSubject`, `PageOfSubject` schemas under `components/schemas` per §C01 (defaults: `archived=false`).
2. Use `$ref` to `common.yaml` Page pattern if shared, else inline `PageOfSubject`.

## Acceptance
- [ ] Schemas match §C01; valid OpenAPI 3.1; `make gen` emits Go `Subject` + TS type.
> Do not edit `openapi.yaml` (W01 refs this file).
