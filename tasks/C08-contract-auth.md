# C08 — Parent / auth schema

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/auth.yaml`

## Reads
- `tasks/CONTRACTS.md` §C08

## Steps
1. `Parent`, `Credential` (`isBackup` default false), `RegisterBegin`, `Session`.
2. WebAuthn ceremony request/response bodies typed as free-form `object` (handled by libs).

## Acceptance
- [ ] Matches §C08; email format; codegen emits types.
