# <ID> — <Title>

- **Wave:** <0 | 1 | 2a | 2b | 2c | 2d | 3 | 4>
- **Module:** <foundation | contract | db | core | api | ui | hooks | pages | tests | wiring>
- **Lang:** <Go | TS/React | SQL | OpenAPI YAML>  · **Suggested agent:** <coder-agent | general-purpose>
- **Depends on:** <task IDs, or —>

## Goal
One or two sentences. What this produces and why. Link spec/screen section if relevant.

## Owns (edit ONLY these)
- `path/to/file`
> Do not create/edit any file outside this list. The chi router (W02), DI wiring (W04), OpenAPI root + codegen (W01), and frontend barrels (W03) are owned by wiring tasks.

## Reads (frozen — do not modify)
- `tasks/CONTRACTS.md` § <C##>
- Go: generated types in `backend/internal/contracts`
- TS: generated client in `frontend/src/api`
- <other read-only deps>

## Steps
1. …

## Acceptance
- [ ] <observable behavior / signature matches the generated contract type>
- [ ] Tests pass (Go: `go test ./...` · TS: `pnpm test` · E2E: `pnpm e2e`).
- [ ] Lint clean (Go: `golangci-lint run` · TS: `pnpm lint`).
- [ ] Only owned files changed.

## Notes / stubs
If a dependency isn't ready, build against the generated contract type and mock it. Never wait on another agent's running code.
