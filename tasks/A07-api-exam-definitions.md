# A07 — GET/POST /exam-definitions

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D04, F09

## Owns
- `backend/internal/http/examdefs.go`

## Steps
1. `ExamDefsList` (`?subjectId`, paginated), `ExamDefCreate` (validate; defaults from C04/DB apply).

## Acceptance
- [ ] Create applies spec defaults (size 20, passBar 70, cooldown 10, flat). Parent-guarded.
