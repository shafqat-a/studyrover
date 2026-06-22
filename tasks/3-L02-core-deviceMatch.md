# 3-L02 — Device / MAC matching

- **Wave:** 3-core · **Module:** core · **Lang:** Go · **Depends on:** 3-C01

## Owns
- `guardian/internal/core/match.go`

## Steps
1. `NormalizeMAC(s) string` (canonical form); `FindTarget(devices, mac) *Device` — only registered devices are gated (targeted, allow-by-default, spec §11).

## Acceptance
- [ ] MAC normalization robust; unregistered → no match (passes freely). Covered by 3-T03.
