# A15 — POST /attempts/{id}/submit (grade)

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D07, D08, L01, L02, L03, L06, L07, L11, F09

## Goal
Grade an attempt and emit the ScoreEvent — the heart of the loop.

## Owns
- `backend/internal/http/attempts_submit.go`

## Reads
- `internal/core` (ScoreAttempt, DidPass, PerTopicBreakdown, CooldownUntil, UpdateMastery, BuildScoreEvent)

## Steps
1. Validate `SubmitAttempt`; load attempt + question key (answers server-side only). Reject if not `in_progress` (409).
2. Score → pass → breakdown. Persist Answers + graded attempt (submitted, scorePct, passed, perTopic, submittedAt) in a tx.
3. On fail: set `cooldownUntil` (from def.cooldownMin). Update mastery. Build + persist `ScoreEvent`.
4. Return graded `ExamAttempt` + `ScoreEvent`.

## Acceptance
- [ ] Correct grading; cooldown on fail; ScoreEvent matches C10; double-submit blocked (409). Student-guarded. Core of T05.
