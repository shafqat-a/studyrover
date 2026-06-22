# L03 — PerTopicBreakdown

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C03, C06

## Owns
- `backend/internal/core/breakdown.go`

## Steps
1. `func PerTopicBreakdown(answers []Answer, qTopic map[string]string) []PerTopicScore` grouping by topic id.
2. Questions without a topic grouped under stable key `"untopiced"`.

## Acceptance
- [ ] Correct grouping; counts sum to total. Covered by T01.
