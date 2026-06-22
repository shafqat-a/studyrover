# 2-H04 — useSyllabusSuggest

- **Wave:** 2-hooks · **Module:** hooks · **Lang:** TS/React · **Depends on:** 2-W01, 2-H03

## Owns
- `frontend/src/hooks/useSyllabusSuggest.ts`

## Steps
1. `useSuggestSyllabus(subjectId)` → job; `useApplySyllabus(subjectId)` → topics.

## Acceptance
- [ ] Suggest returns job result; apply creates topics + invalidates `['topics']`.
