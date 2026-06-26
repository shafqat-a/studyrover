# 2-F01 — Knowledge `Source` interface

- **Wave:** 2-foundation · **Module:** knowledge · **Lang:** Go · **Depends on:** F02

## Goal
Define the swappable knowledge-backend interface (spec §4) all AI features call through. No impl here — just the contract + types.

## Owns
- `backend/internal/knowledge/source.go` (`Source` interface + `IngestRequest`, `GenRequest`, `GuideRequest`, `AskRequest`, `AnswerChunk`, `TopicSuggestion`, `QuestionDraft`, `JobID`)

## Reads
- `tasks/CONTRACTS-P2.md` (adapter section)

## Steps
1. Methods: `Ingest`, `DeriveSyllabus`, `GenerateQuestions`, `GenerateStudyGuide`, `AnswerGrounded` (streaming channel).
2. Keep request/response types here; map to OpenAPI types at the HTTP edge.

## Acceptance
- [ ] Compiles; impls (2-F02/03/04) satisfy it. No network calls in this file.
