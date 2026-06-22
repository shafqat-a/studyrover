# H01 — useSubjects

- **Wave:** 2d · **Module:** hooks · **Lang:** TS/React · **Depends on:** W01

## Owns
- `frontend/src/hooks/useSubjects.ts`

## Reads
- generated client + types in `frontend/src/api` (W01/W03)

## Steps
1. TanStack Query: `useSubjects()`, `useSubject(id)`, `useCreateSubject`, `useUpdateSubject`, `useDeleteSubject` against `/api/subjects`.
2. Invalidate `['subjects']` on mutation; toast on error.

## Acceptance
- [ ] Types from generated client; mutations invalidate cache. Mockable during dev.
> If API not live, build against generated types + a fetch mock; no waiting.
