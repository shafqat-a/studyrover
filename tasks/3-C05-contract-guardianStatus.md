# 3-C05 — GuardianStatus contract

- **Wave:** 3-contract · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06, 3-C03

## Owns
- `contracts/components/guardian/status.yaml`

## Steps
1. `GuardianStatus{active: ActiveGrant[], history: Grant[], dailyUsage:[{studentId, minutesToday}]}`.

## Acceptance
- [ ] Valid 3.1; `$ref`s grant.yaml; codegen emits types.
