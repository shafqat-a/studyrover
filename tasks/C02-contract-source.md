# C02 — Source schema

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/source.yaml`

## Reads
- `tasks/CONTRACTS.md` §C02

## Steps
1. `SourceType`/`SourceStatus` enums; `Source` (default `status=ready`), `CreateSource`, `PageOfSource`.

## Acceptance
- [ ] Matches §C02; valid 3.1; codegen emits Go + TS types.
