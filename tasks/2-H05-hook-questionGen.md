# 2-H05 — useQuestionGen / useQuestionDrafts

- **Wave:** 2-hooks · **Module:** hooks · **Lang:** TS/React · **Depends on:** 2-W01, 2-H03

## Owns
- `frontend/src/hooks/useQuestionGen.ts`

## Steps
1. `useGenerateQuestions(subjectId)` → job; `useQuestionDrafts(subjectId)`, `useApproveDraft`, `useRejectDraft`.

## Acceptance
- [ ] Gen job → drafts; approve invalidates `['questions']`.
