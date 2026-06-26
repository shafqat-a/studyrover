# 3-F03 — Network `Wall` interface

- **Wave:** 3-foundation · **Module:** wall · **Lang:** Go · **Depends on:** 3-F01

## Goal
The swappable Network Wall interface (mirrors the knowledge adapter pattern). Impls: RouterOS + fake.

## Owns
- `guardian/internal/wall/wall.go` (`Wall` interface + `ActiveGrant`, `DiscoveredDevice` types)

## Reads
- `tasks/CONTRACTS-P3.md` (Wall section)

## Steps
1. `Grant(mac, minutes)`, `Revoke(mac)`, `ListActive()`, `Discover()`.

## Acceptance
- [ ] Compiles; RouterOS (3-F04) + fake (3-F05) satisfy it.
