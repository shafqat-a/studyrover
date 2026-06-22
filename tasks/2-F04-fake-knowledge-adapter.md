# 2-F04 — Fake knowledge adapter

- **Wave:** 2-foundation · **Module:** knowledge · **Lang:** Go · **Depends on:** 2-F01

## Goal
Deterministic in-memory `Source` so all Phase 2 features + tests run offline with no API key/hardware.

## Owns
- `backend/internal/knowledge/fake/fake.go`

## Steps
1. Return canned study guides, citations, syllabus suggestions, and N question drafts from the input text.
2. Deterministic (seeded) for tests.

## Acceptance
- [ ] Satisfies `Source`; used by 2-T01/04/05 and local dev. No external calls.
