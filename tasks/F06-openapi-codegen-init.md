# F06 — OpenAPI scaffold + codegen pipeline

- **Wave:** 0 · **Module:** foundation · **Lang:** OpenAPI/config · **Depends on:** F02, F05

## Goal
Set up the contract directory and the two codegen toolchains so the frozen OpenAPI spec produces Go types/server-iface and a TS client. **Most depended-on setup** — both languages build on it.

## Owns
- `contracts/components/.gitkeep`
- `contracts/oapi-codegen.yaml` (config: `models` + `chi-server` → `backend/internal/contracts`)
- `contracts/openapi-ts.config.ts` (openapi-typescript → `frontend/src/api/schema.d.ts`)
- `contracts/info.yaml` (openapi version, info, servers, security schemes — referenced by root)

## Steps
1. Choose `oapi-codegen` (Go) + `openapi-typescript` (+ `openapi-fetch`) for TS.
2. Wire `make gen` to run both after assembling the root (root assembled by W01).
3. Define `info.yaml` (title, version, `/api` server, cookie-session security scheme).

## Acceptance
- [ ] `make gen` is wired (no schemas yet = trivial run once root exists).
- [ ] Output paths land in `backend/internal/contracts` and `frontend/src/api`.
> The root `openapi.yaml` that `$ref`s all components is owned by W01.
