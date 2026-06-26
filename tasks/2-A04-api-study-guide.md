# 2-A04 — POST/GET /subjects/{id}/study-guide

- **Wave:** 2-api · **Module:** api · **Lang:** Go · **Depends on:** 2-D02, 2-F05, 2-L02

## Owns
- `backend/internal/http/study_guide.go`

## Steps
1. `StudyGuideGenerate` (POST): call backend, compose (2-L02), upsert, return. `StudyGuideGet` (GET): cached guide.

## Acceptance
- [ ] Generates + persists + returns; parent/student guarded.
