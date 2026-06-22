# 3-F08 — Captive portal server

- **Wave:** 3-foundation · **Module:** portal · **Lang:** Go · **Depends on:** 3-F01

## Goal
Serve the captive-portal gate page that MikroTik redirects unauthenticated target devices to (walled-garden friendly).

## Owns
- `guardian/internal/portal/server.go` (gate routes; serves the SPA gate page; walled-garden allowlist note)

## Steps
1. Serve `/portal/gate` (the "take a quiz to get online" page) + handle post-pass login/redirect to RouterOS.
2. Keep assets loadable while the device is otherwise blocked.

## Acceptance
- [ ] Gate page served to blocked devices; post-pass redirect wired (3-A11).
