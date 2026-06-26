# L12 — ComputeStreak

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C06

## Owns
- `backend/internal/core/streak.go`

## Steps
1. `func ComputeStreak(attempts []ExamAttempt, now time.Time, loc *time.Location) (current, longest int)` — consecutive days with a passed attempt; break on gap (spec §6 visible progress).

## Acceptance
- [ ] Correct current/longest on fixtures; tz-aware. Covered by T04.
