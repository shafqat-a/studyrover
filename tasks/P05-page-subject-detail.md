# P05 — Subject detail + tabs (screen 2.3)

- **Wave:** 3 · **Module:** pages · **Lang:** TS/React · **Depends on:** H01, U09, U20

## Goal
Hub for one subject with routed tabs to Sources/Syllabus/Exams/Questions (Tutor tab disabled, P2).

## Owns
- `frontend/src/pages/SubjectDetail.tsx` (layout + tab nav via U09; renders nested route outlet)

## Steps
1. Header with inline-editable name/description (H01). Tab bar linking to P06–P09 child routes (React Router nested routes / `<Outlet/>`). Index → Sources.

## Acceptance
- [ ] Renders subject + tab nav; child routes mount via Outlet. Matches screen 2.3.
> Child tab pages are P06–P09. Nested route registration via W03.
