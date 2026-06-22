# A03 — GET/POST /sources

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D02, F09

## Owns
- `backend/internal/http/sources.go`

## Steps
1. `SourcesList` (`?subjectId`, paginated), `SourceCreate` (validate `CreateSource`). Phase 1 manual; `file` stores `fileRef` only; default `status=ready`.

## Acceptance
- [ ] Requires subjectId on list; create returns Source. Parent-guarded.
