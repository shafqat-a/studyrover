# 2-F02 — Gemini-direct adapter

- **Wave:** 2-foundation · **Module:** knowledge · **Lang:** Go · **Depends on:** 2-F01

## Goal
Implement `knowledge.Source` against the **Gemini API** (official, stable). Document understanding (incl. scanned-PDF OCR) + grounded generation. The robust path.

## Owns
- `backend/internal/knowledge/gemini/gemini.go`
- `backend/internal/knowledge/gemini/client.go` (API key from config; HTTP client; retries)

## Steps
1. Implement all `Source` methods via Gemini (file upload/understanding for ingest+OCR; grounded answers with citations; structured output for question drafts/syllabus).
2. Stream `AnswerGrounded` chunks.

## Acceptance
- [ ] Satisfies `Source`; unit-tested with a mocked HTTP transport (no live key in CI).
