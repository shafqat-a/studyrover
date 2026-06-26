---
name: studyrover-stack
description: StudyRover Phase 1 tech stack — Go backend + React/Vite SPA, OpenAPI contract
metadata:
  type: project
---

StudyRover Phase 1 stack (decided 2026-06-22):

- **Backend (prod runtime):** Go — chi router, sqlc + pgx over PostgreSQL, go-webauthn for FIDO2, golang-migrate. Single static binary serves the API and the built SPA (go:embed).
- **Frontend:** React + Vite SPA (TypeScript, Tailwind, React Router, React Query, @simplewebauthn/browser). Built with Node at build-time only, shipped as static assets.
- **Contract:** OpenAPI 3.1 as the single frozen source of truth (`contracts/`), multi-file via `$ref` (one schema file per entity). Codegen: oapi-codegen → Go types + chi server interface; openapi-typescript → TS client. This is what lets the two languages stay in sync and lets agents build both sides in parallel.
- **DB:** SQL migrations (golang-migrate) + sqlc queries, one file per table.

Node.js is build-only here — see [[prod-runtime-no-nodejs]]. Task breakdown lives in `tasks/` (124 micro-tasks, Phase 1 only). Spec source of truth: `docs/spec/StudyRover-Spec-and-Plan.md`.
