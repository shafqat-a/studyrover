# F10 — CI + lint/format

- **Wave:** 0 · **Module:** foundation · **Lang:** misc · **Depends on:** F01

## Goal
Uniform code across 100+ agents and early breakage detection, both languages.

## Owns
- `.github/workflows/ci.yml` (jobs: gen-check, go test+vet+golangci-lint, frontend lint+test+build, e2e)
- `.golangci.yml`
- `frontend/.eslintrc.cjs`, `frontend/.prettierrc`

## Steps
1. CI: assert `make gen` produces no diff (contract/codegen in sync), then build/test both sides.
2. golangci-lint for Go; eslint+prettier for frontend.

## Acceptance
- [ ] `golangci-lint run` and `pnpm --dir frontend lint` run.
- [ ] CI workflow valid; gen-drift check present.
