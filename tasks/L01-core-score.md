# L01 — ScoreAttempt

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C06

## Owns
- `backend/internal/core/score.go`

## Reads
- generated contract types (Answer, Question)

## Steps
1. `func ScoreAttempt(answers []Answer, key map[string]string) (correct, total int, scorePct int)` where key = questionID→correctOptionID.
2. `scorePct = round(correct/total*100)`; total 0 → 0.

## Acceptance
- [ ] Pure; 14/20→70; empty→0. Covered by T01.
