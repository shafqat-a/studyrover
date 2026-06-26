# L10 — ResolveSettings

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C09

## Owns
- `backend/internal/core/settings.go`

## Steps
1. Define `DefaultSettings` (spec defaults: rate 3, cap 3, size 20, passBar 70, cooldown 10, backend notebooklm, ramp false).
2. `func ResolveSettings(stored *Settings) Settings` — fill any zero/missing field from defaults.

## Acceptance
- [ ] `ResolveSettings(nil)` == defaults; partial override merges. Covered by T03.
