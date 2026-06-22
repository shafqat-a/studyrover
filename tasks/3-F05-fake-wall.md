# 3-F05 — Fake Wall

- **Wave:** 3-foundation · **Module:** wall · **Lang:** Go · **Depends on:** 3-F03

## Goal
In-memory `Wall` so all of Phase 3 + tests run with no MikroTik hardware.

## Owns
- `guardian/internal/wall/fake/fake.go`

## Steps
1. Track grants in memory with expiry; `Discover` returns seeded devices.

## Acceptance
- [ ] Satisfies `Wall`; used by 3-T0x + local dev.
