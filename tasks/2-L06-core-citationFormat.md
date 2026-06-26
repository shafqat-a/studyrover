# 2-L06 — Citation formatting

- **Wave:** 2-core · **Module:** core · **Lang:** Go · **Depends on:** 2-C01

## Owns
- `backend/internal/core/citation.go`

## Steps
1. `FormatCitations(raw) []Citation` — map backend grounding refs to `{sourceId,label,locator}`; dedupe.

## Acceptance
- [ ] Stable, deduped citations. Pure. Covered by 2-T02.
