---
name: prod-runtime-no-nodejs
description: User forbids Node.js as a production server runtime; Go/.NET only (Rust ok, not preferred)
metadata:
  type: feedback
---

Node.js (and JS tooling generally) is acceptable **only** for dev runtime, build, and prod build tooling — **never** as a production server runtime. For prod runtime the choices are **Go** or **.NET**; **Rust** is acceptable but not recommended.

**Why:** User strongly dislikes Node.js as a server. Wants compiled, deployable prod runtimes.

**How to apply:** Never propose Next.js SSR / Express / Fastify / Nest as the production server. A React/Vite frontend is fine (Node builds it, then it ships as static assets served by the Go/.NET binary or a CDN). Default backend pick for StudyRover = **Go** (chi + sqlc + pgx + go-webauthn, single static binary serving API + SPA). Cross-language API contract via OpenAPI (generate Go server types + TS client). See [[studyrover-stack]].
