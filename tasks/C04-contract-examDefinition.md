# C04 — ExamDefinition schema

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/examDefinition.yaml`

## Reads
- `tasks/CONTRACTS.md` §C04 (defaults = spec §10)

## Steps
1. `ExamType`/`RewardStyle` enums; `ExamDefinition` with defaults (type gate, size 20, passBar 70, cooldownMin 10, rewardStyle flat, scopeTopicIds []), `CreateExamDefinition`, `PageOfExamDefinition`.
2. Constraints `size>=1`, `0<=passBar<=100`.

## Acceptance
- [ ] Defaults exactly match spec §10; valid 3.1; codegen emits types.
