# F11 — Frontend app shell: router + providers

- **Wave:** 0 · **Module:** foundation · **Lang:** TS/React · **Depends on:** F05, F07

## Goal
React Router structure with parent + student areas and global providers, so every P-task drops a page into a ready shell.

## Owns
- `frontend/src/app/router.tsx` (routes: parent area, student area, lazy page slots)
- `frontend/src/app/ParentLayout.tsx`, `frontend/src/app/StudentLayout.tsx` (nav chrome)
- `frontend/src/app/providers.tsx` (QueryClientProvider + Toast provider)
- `frontend/src/App.tsx`

## Reads
- `@/components` (lazy; stub if not built)

## Steps
1. Two layouts with role nav; nested routes for subject tabs.
2. Mount React Query client + toast provider.
3. Pages registered by route path (page components owned by P-tasks; this defines the slots).

## Acceptance
- [ ] Parent + student areas render their shells; routing works.
- [ ] React Query + toast available app-wide.
> Page bodies are P-tasks. Route registration of new pages is updated by W03.
