# A21 — GET /progress

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D07, L07, L12, F09

## Goal
Aggregate progress: per-topic mastery, streak, recent history, avg score. No internet-time fields (Guardian off).

## Owns
- `backend/internal/http/progress.go`

## Reads
- `internal/core` (UpdateMastery over history, ComputeStreak)

## Steps
1. Load student's attempts; compute mastery (L07) + streak (L12); return `{mastery, streak, recentAttempts, avgScore}`.

## Acceptance
- [ ] Returns mastery + streak + history; no `minutes`/reward fields. Parent or owning-student.
