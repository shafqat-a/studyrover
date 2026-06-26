# 3-C04 — Override contract

- **Wave:** 3-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/guardian/override.yaml`

## Steps
1. `OverrideRequest{deviceId, durationMin, reason?}`, `OverrideLog{id, deviceId, durationMin, reason?, who, at}`.

## Acceptance
- [ ] Valid 3.1; codegen emits types.
