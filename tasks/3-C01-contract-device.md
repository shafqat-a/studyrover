# 3-C01 — Device contract

- **Wave:** 3-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/guardian/device.yaml`

## Steps
1. `Device{id, name, mac, ip?, hostname?, studentId, gated, createdAt}`, `CreateDevice`, `DiscoveredDevice` per CONTRACTS-P3.md §3-C01.

## Acceptance
- [ ] Valid 3.1; MAC required; codegen emits Go + TS.
