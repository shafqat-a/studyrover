# 2-T02 — Phase-2 core unit tests

- **Wave:** 2-tests · **Module:** tests · **Lang:** Go · **Depends on:** 2-L01, 2-L02, 2-L03, 2-L04, 2-L05, 2-L06

## Owns
- `backend/internal/core/promptassembly_test.go`, `draftvalidator_test.go`, `syllabusnorm_test.go`, `dashboard_test.go`, `citation_test.go`

## Steps
1. Prompt includes instructions+guidance; validator rejects bad drafts; syllabus flatten order; dashboard aggregates; citation dedupe.

## Acceptance
- [ ] `go test ./internal/core/...` green for Phase-2 funcs.
