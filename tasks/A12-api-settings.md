# A12 — GET/PUT /settings

- **Wave:** 2b · **Module:** api · **Lang:** Go · **Depends on:** D11, L10, F09

## Owns
- `backend/internal/http/settings.go`

## Steps
1. `SettingsGet`: read singleton; pass through `core.ResolveSettings` (L10) so missing fields fall back to defaults.
2. `SettingsUpdate`: validate partial; upsert singleton.

## Acceptance
- [ ] GET returns complete Settings (defaults applied); PUT persists. Parent-guarded.
