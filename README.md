# StudyRover

Personal **study-to-earn-internet** system (studyrover.com).

The **Study Platform** — subjects, AI tutor, exams — is the product and runs standalone. An optional **Guardian** (Reward Engine + MikroTik Network Wall) turns exam scores into enforced internet time. The two halves are decoupled; the only contract between them is an exam **score**. The system works with or without the Guardian.

## Build
Run `make` to list build targets (`gen`, `build`, `dev`, `test`, `lint`, `migrate`, `seed`). The parallel task breakdown lives in [`tasks/`](tasks/).

## Docs
- `docs/spec/StudyRover-Spec-and-Plan.md` — product spec + phased build plan (the source of truth)
- `docs/spec/StudyRover-Architecture.mermaid` — system architecture diagram
- `docs/spec/StudyRover-Screens.md` — screen & input inventory (frontend build reference)
- `conversation.txt` — full design conversation and rationale

## Status
Design/spec phase. Build is **value-first**:
- **Phase 1** — the tutoring core: study + exams + scores/mastery (a complete tool, no Guardian)
- **Phase 2** — AI tutor + knowledge backend (NotebookLM/Gemini), dashboard, progress
- **Phase 3** — the optional Guardian: Reward Engine + MikroTik Network Wall

## Key decided defaults
- Quiz: multiple choice, configurable size (default 20 q ≈ 60 min; min 5 q ≈ 15 min), 3 min/question
- Pass bar 70%, post-fail cooldown ~10 min (these contain MCQ guessing)
- Network: WiFi-only, MikroTik hotspot, targeted & allow-by-default (only the student's device is gated)
- Parent override via FIDO2/WebAuthn (register a backup key)
- Everything configurable, but ships with sensible defaults
