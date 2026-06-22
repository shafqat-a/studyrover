# L07 — UpdateMastery

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C03, C06

## Owns
- `backend/internal/core/mastery.go`

## Steps
1. Define `TopicMastery{ TopicID string; Mastery float64; Attempts int }`.
2. `func UpdateMastery(prior []TopicMastery, perTopic []PerTopicScore, alpha float64) []TopicMastery` — EMA of correct ratio (default alpha 0.4).

## Acceptance
- [ ] Pure; trends toward recent performance. Covered by T04.
