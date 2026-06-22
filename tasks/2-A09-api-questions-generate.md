# 2-A09 — POST /questions/generate

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D06, 2-F05, 2-F06, 2-L03

## Owns
- `backend/internal/http/questions_generate.go`
- `backend/internal/jobs/questiongen_handler.go`

## Steps
1. Enqueue a question-gen job; handler calls `knowledge.GenerateQuestions`, validates each (2-L03), stores as `question_draft` (pending).

## Acceptance
- [ ] Returns Job; valid drafts persisted pending review. Covered by 2-T04/06.
