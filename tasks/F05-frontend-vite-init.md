# F05 — Frontend Vite + React + TS init

- **Wave:** 0 · **Module:** foundation · **Lang:** TS/React · **Depends on:** F01

## Goal
Scaffold the React SPA built by Vite (Node build-time only). Output is static assets the Go binary embeds.

## Owns
- `frontend/package.json` (react, react-dom, react-router-dom, @tanstack/react-query, @simplewebauthn/browser)
- `frontend/vite.config.ts` (build to `dist/`; dev proxy `/api` → backend)
- `frontend/tsconfig.json`, `frontend/index.html`, `frontend/src/main.tsx`

## Steps
1. Vite React-TS template; configure dev server proxy so `/api` hits the Go backend in dev.
2. Build emits hashed static assets to `frontend/dist` (consumed by W02 `go:embed`).

## Acceptance
- [ ] `pnpm --dir frontend dev` serves the SPA; `/api` proxies to backend.
- [ ] `pnpm --dir frontend build` emits `dist/`.
