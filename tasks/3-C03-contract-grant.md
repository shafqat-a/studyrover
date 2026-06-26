# 3-C03 — Grant / Session contract

- **Wave:** 3-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/guardian/grant.yaml`

## Steps
1. `Grant{id, deviceId, mac, minutes, startedAt, expiresAt, source(exam|override|manual), revokedAt?}`, `ActiveGrant{...remaining}`.

## Acceptance
- [ ] Valid 3.1; codegen emits types.
