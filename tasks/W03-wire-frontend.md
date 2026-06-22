# W03 — Frontend api-client + providers + route registration

- **Wave:** 4 (runs continuously) · **Module:** wiring · **Lang:** TS/React · **Depends on:** U01–U20, H01–H10, P01–P14, W01

## Goal
Single owner of the frontend composition: the typed API client instance, the component/hook barrels, and registering every page route.

## Owns
- `frontend/src/api/client.ts` (configure `openapi-fetch` client over generated `schema.d.ts`; base `/api`, credentials include)
- `frontend/src/components/index.ts` (barrel re-exporting U01–U20)
- `frontend/src/hooks/index.ts` (barrel re-exporting H01–H10)
- route registration additions in `src/app/router.tsx` for P01–P14 (owned jointly with F11? No — W03 owns route registration; F11 owns layouts/providers)

## Reads
- generated client (W01), components/hooks/pages

## Steps
1. Instantiate the typed fetch client; export for hooks.
2. Barrels for components + hooks.
3. Register each P-page under its path (parent/student areas, nested subject tabs).

## Acceptance
- [ ] `pnpm --dir frontend build` green; all routes resolve; client is fully typed against the contract.
> Coordinate the single `router.tsx` here so P-tasks never edit it; F11 created its skeleton.
