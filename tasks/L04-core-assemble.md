# L04 — AssembleExam

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C04, C05

## Owns
- `backend/internal/core/assemble.go`

## Reads
- generated types; uses `ShuffleOptions` (L05), `SelectFromBank` (L08), `RNG` (F04)

## Steps
1. `func AssembleExam(def ExamDefinition, bank []Question, rng RNG) []DeliveredQuestion`.
2. Filter bank: `enabled` + topic ∈ `scopeTopicIds` (empty = whole subject). Pick `def.Size` via SelectFromBank; shuffle options; strip `CorrectOptionID`.

## Acceptance
- [ ] Returns ≤ size; no answers leaked; deterministic with seeded RNG. Covered by T02.
