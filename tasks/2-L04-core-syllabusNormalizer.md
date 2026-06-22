# 2-L04 — Syllabus normalizer

- **Wave:** 2-core · **Module:** core · **Lang:** Go · **Depends on:** 2-C04, C03

## Owns
- `backend/internal/core/syllabusnorm.go`

## Steps
1. `NormalizeSyllabus(suggestions []TopicSuggestion) []CreateTopic` — flatten tree → ordered Topic create shapes (C03), assign `order`.

## Acceptance
- [ ] Stable ordering; tree→flat correct. Covered by 2-T02.
