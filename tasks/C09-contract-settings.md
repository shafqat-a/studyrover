# C09 — Settings schema (defaults source of truth)

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/settings.yaml`

## Reads
- `tasks/CONTRACTS.md` §C09 (spec §6/§10)

## Steps
1. `KnowledgeBackend` enum; `Settings` with `default:` on every field (rate 3, cap 3, size 20, passBar 70, cooldown 10, backend notebooklm, ramp false).
2. Document reward rate/daily cap as Guardian-side (stored now, used P3).

## Acceptance
- [ ] All defaults match spec; codegen emits types. (Go `L10` re-applies these as the runtime fallback.)
