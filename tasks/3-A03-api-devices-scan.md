# 3-A03 — POST /guardian/devices/scan

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-F03, 3-F07

## Owns
- `guardian/internal/http/devices_scan.go`

## Steps
1. `DevicesScan`: call `Wall.Discover` → `DiscoveredDevice[]` (fills MAC/IP/hostname for easy add). Parent-guarded.

## Acceptance
- [ ] Returns discovered devices (real or fake wall).
