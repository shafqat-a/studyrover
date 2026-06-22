# A13 — POST /attempts (start exam)

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D07, L04, L06, L08, F09

## Goal
Start an attempt: assemble questions, persist, return delivered questions **without answers**.

## Owns
- `backend/internal/http/attempts_start.go`

## Reads
- `internal/core` (AssembleExam, SelectFromBank, IsInCooldown), `internal/store`, student guard

## Steps
1. Validate `StartAttempt`. Load ExamDefinition + eligible bank + options.
2. Cooldown: if last attempt of this exam failed and `IsInCooldown`, return 409 `Problem{CONFLICT}` with `cooldownUntil`.
3. `AssembleExam` → persist `ExamAttempt{questionIds, in_progress}`. Return attempt + `DeliveredQuestion[]`.

## Acceptance
- [ ] Exactly `size` questions, no answers leaked; cooldown blocks (409). Student-guarded. Covered by T05.
