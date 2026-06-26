# 2-L01 — Prompt assembly

- **Wave:** 2-core · **Module:** core · **Lang:** Go · **Depends on:** 2-F09, 2-C06, 2-C07

## Owns
- `backend/internal/core/promptassembly.go`

## Steps
1. `BuildTutorPrompt(syllabus, progress, instructions TutorInstructions, guidance []Guidance) string` — merge into the tutor system prompt via 2-F09 templates.

## Acceptance
- [ ] Deterministic; includes per-subject instructions + parent guidance. Covered by 2-T02.
