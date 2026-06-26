# W01 — OpenAPI root + codegen (Go + TS)

- **Wave:** 4 (runs continuously) · **Module:** wiring · **Lang:** OpenAPI/config · **Depends on:** C01–C11

## Goal
Single owner of the OpenAPI **root** that `$ref`s all component schemas + declares all paths, and of running codegen so both languages get types. The linchpin that keeps Go and TS in sync.

## Owns
- `contracts/openapi.yaml` (root: info, servers, security, `paths`, `$ref`s to `components/*.yaml`)
- generated output dirs registration: `backend/internal/contracts/*` (oapi-codegen), `frontend/src/api/schema.d.ts` + `frontend/src/api/client.ts` base

## Reads
- all `contracts/components/*.yaml` (C-tasks), `oapi-codegen.yaml`/`openapi-ts.config.ts` (F06)

## Steps
1. Author `paths` for every endpoint in CONTRACTS.md (referencing component request/response schemas + `common.yaml` Problem/pagination).
2. `make gen` → oapi-codegen (models + chi-server interface) + openapi-typescript (+ openapi-fetch client).
3. Re-run whenever a C-task or A-path lands; keep root and generated output authoritative.

## Acceptance
- [ ] `make gen` produces compiling Go types/server-iface + TS client.
- [ ] CI gen-drift check (F10) passes (no uncommitted diff).
> Only this task edits `openapi.yaml`; C-tasks own only their component files.
