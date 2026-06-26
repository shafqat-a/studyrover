# 3-A11 — Captive portal endpoints

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-F08, 3-F03

## Owns
- `guardian/internal/http/portal.go`

## Steps
1. `GET /portal/gate` (state for the gate page: device gated? remaining time?) ; `POST /portal/login` (after a passing exam grant, log the device into the hotspot / redirect).
2. Walled-garden-safe (portal assets load while blocked).

## Acceptance
- [ ] Gate reflects device state; post-pass login opens access. Drives screen 4.4.
