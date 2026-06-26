# 2-C05 — QuestionDraft contract

- **Wave:** 2-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/questionDraft.yaml`

## Steps
1. `QuestionDraft{id, subjectId, topicId?, text, options:[{text}] (min 4), correctOptionIndex, difficulty, status(pending|approved|rejected)}`, `GenRequest{subjectId, topicId?, count}`.

## Acceptance
- [ ] Valid 3.1; mirrors Question (C05) shape so approve maps cleanly.
