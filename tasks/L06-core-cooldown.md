# L06 — CooldownUntil / IsInCooldown

- **Wave:** 2a · **Module:** core · **Lang:** Go · **Depends on:** C04

## Owns
- `backend/internal/core/cooldown.go`

## Steps
1. `func CooldownUntil(now time.Time, cooldownMin int) time.Time`.
2. `func IsInCooldown(until, now time.Time) bool`.

## Acceptance
- [ ] +10min default; boundary correct. Covered by T03.
