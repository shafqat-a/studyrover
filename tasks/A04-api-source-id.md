# A04 — GET/DELETE /sources/{id}

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D02, F09

## Owns
- `backend/internal/http/sources_id.go`

## Steps
1. `SourceGet`, `SourceDelete`; 404 Problem on missing.

## Acceptance
- [ ] Get + delete; 404 on missing. Parent-guarded.
