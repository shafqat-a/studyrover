# A02 — GET/PUT/DELETE /subjects/{id}

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D01, F09

## Owns
- `backend/internal/http/subjects_id.go`

## Steps
1. `SubjectGet/SubjectUpdate/SubjectDelete` methods on `*Handlers`. 404 `Problem{NOT_FOUND}` on missing. PUT validates partial. DELETE cascades.

## Acceptance
- [ ] 404 envelope on missing; PUT validates; DELETE cascades. Parent-guarded.
