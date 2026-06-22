# F01 — Repo layout + Makefile + tooling

- **Wave:** 0 · **Module:** foundation · **Lang:** misc · **Depends on:** —

## Goal
Create the polyglot repo skeleton (`backend/` Go, `frontend/` Vite, `contracts/` OpenAPI) and a single Makefile that orchestrates codegen, build, test, lint for both languages.

## Owns
- `Makefile` (targets: `gen`, `build`, `dev`, `test`, `lint`, `migrate`, `seed`)
- `.gitignore`, `.editorconfig`, `.tool-versions` (go + node versions)
- top-level `README` pointer note (one line linking tasks/)

## Steps
1. Make targets shell out to Go and pnpm appropriately; `build` = `gen` → backend binary embedding built SPA.
2. Pin Go and Node toolchain versions (Node is build-only).

## Acceptance
- [ ] `make` lists targets; directories `backend/ frontend/ contracts/` exist.
- [ ] No Node required to *run* the backend (only to build the SPA).
