# C11 — Common: error (problem) + pagination

- **Wave:** 1 · **Module:** contract · **Lang:** OpenAPI YAML · **Depends on:** F06

## Owns
- `contracts/components/common.yaml`

## Reads
- `tasks/CONTRACTS.md` §C11

## Steps
1. `Problem` (RFC-7807-ish: type/title/status/detail/code) + `Code` enum.
2. `PaginationParams` (query `page` default 1, `pageSize` default 50 max 200). Reusable `parameters`.
3. Optionally a generic Page builder note (concrete `PageOf*` live with each entity).

## Acceptance
- [ ] Problem + pagination params valid 3.1; reused via `$ref` by handlers (W02/A-tasks) and entities.
