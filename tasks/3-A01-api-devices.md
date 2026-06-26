# 3-A01 — GET/POST /guardian/devices

- **Wave:** 3-api · **Module:** api · **Lang:** Go · **Depends on:** 3-D01, 3-F07

## Owns
- `guardian/internal/http/devices.go`

## Steps
1. `DevicesList`, `DeviceCreate` (validate `CreateDevice`; normalize MAC via 3-L02; bind to student). Parent-guarded.

## Acceptance
- [ ] List + create; MAC normalized/unique. Matches 3-C01.
