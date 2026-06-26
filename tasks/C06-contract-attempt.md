# C06 — ExamAttempt + Answer schema

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/attempt.yaml`

## Reads
- `tasks/CONTRACTS.md` §C06, §"exam loop"

## Steps
1. `AttemptStatus`, `Answer`, `PerTopicScore`, `ExamAttempt` (graded fields optional, `cooldownUntil?`), `StartAttempt`, `SubmitAttempt`, `PageOfExamAttempt`.
2. `PerTopicScore` here is the canonical def; `scoreEvent.yaml` `$ref`s it.

## Acceptance
- [ ] Matches §C06; `scorePct` 0–100 when present; codegen emits types.
