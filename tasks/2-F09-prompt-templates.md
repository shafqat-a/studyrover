# 2-F09 — LLM prompt templates

- **Wave:** 2-foundation · **Module:** llm · **Lang:** Go · **Depends on:** F02

## Goal
Versioned prompt templates for study-guide, question generation, syllabus derivation, and the tutor system prompt — the raw material 2-L01 assembles.

## Owns
- `backend/internal/llm/prompts.go` (named templates + render helpers)

## Steps
1. Templates accept syllabus, progress, per-subject instructions, parent guidance, target language/tone.
2. Question-gen template demands ≥4 options + one correct + topic tag (so 2-L03 validation passes).

## Acceptance
- [ ] Renders deterministic prompts from inputs; unit-tested for required slots. Covered by 2-T02.
