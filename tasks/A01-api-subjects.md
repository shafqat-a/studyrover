# A01 — GET/POST /subjects

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D01, W04, F09

## Owns
- `backend/internal/http/subjects.go`

## Reads
- generated contract types, `internal/store` (W04), `RequireParent` (F09)

## Steps
1. `func (h *Handlers) SubjectsList(w,r)` — parent-guarded; paginated `PageOfSubject` (exclude archived unless `?includeArchived`).
2. `func (h *Handlers) SubjectCreate(w,r)` — decode + validate `CreateSubject`; insert; 201 `Subject`.
3. Errors → `Problem` (C11) helper.

## Acceptance
- [ ] Bad body → 400 VALIDATION; unauthed → 401; happy path returns subject. No logic beyond CRUD.
> Methods registered on the mux by W02; struct/deps defined in W02.
