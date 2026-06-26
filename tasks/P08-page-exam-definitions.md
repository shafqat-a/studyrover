# P08 — Exam definitions (screen 2.6)

- **Wave:** 3 · **Module:** pages · **Lang:** TS/React · **Depends on:** H04, H03, U02, U03, U13, U14

## Owns
- `frontend/src/pages/SubjectExams.tsx`

## Steps
1. Define exam: name, type (gate/formal), scope multi-select topics (default whole subject), size (default 20; presets 5/10/20), pass bar (70), cooldown (10), reward style (flat). Prefill defaults from settings. CRUD via H04.

## Acceptance
- [ ] Creates exams with spec defaults; scope multi-select; edit/delete. Matches screen 2.6.
