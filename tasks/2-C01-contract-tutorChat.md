# 2-C01 — TutorChat contract

- **Wave:** 2-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/tutorChat.yaml`

## Steps
1. `Conversation`, `Message` (role user|assistant, citations[]), `Citation`, `AskRequest`, SSE `AnswerChunk` per CONTRACTS-P2.md §2-C01.

## Acceptance
- [ ] Valid 3.1; codegen emits Go + TS. Streaming chunk shape defined.
