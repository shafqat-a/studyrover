# C05 — Question + Option schema

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/question.yaml`

## Reads
- `tasks/CONTRACTS.md` §C05

## Steps
1. `Option`, `Difficulty`; `Question` (`options` minItems 4, `correctOptionId`, `enabled` default true).
2. `CreateQuestion` (options as `[{text}]` + `correctOptionIndex`); **`DeliveredQuestion`** (Question minus `correctOptionId`); `PageOfQuestion`.

## Acceptance
- [ ] `DeliveredQuestion` has no `correctOptionId`; minItems 4 enforced; codegen emits both Go + TS.
