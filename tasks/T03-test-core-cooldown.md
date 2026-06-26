# T03 — Cooldown/presets/settings tests (Go)

- **Wave:** 4 · **Module:** tests · **Lang:** Go · **Depends on:** L06, L09, L10

## Owns
- `backend/internal/core/cooldown_test.go`
- `backend/internal/core/presets_test.go`
- `backend/internal/core/settings_test.go`

## Steps
1. Cooldown math with injected clock; presets 20→60; `ResolveSettings(nil)`==defaults; partial merge.

## Acceptance
- [ ] Green; verifies spec defaults exactly.
