// StudyRover — typed API client (W01 base).
//
// A single openapi-fetch client typed by the generated OpenAPI schema
// (schema.d.ts, emitted by `make gen-ts` -> openapi-typescript). Every TanStack
// Query hook (H-tasks) imports THIS client so requests/responses are checked
// against the frozen contract; nothing hand-rolls a fetch or redefines a shape.
//
// The contract's server base path is `/api` (see contracts/openapi.yaml); the
// Go binary serves both the API and the embedded SPA from the same origin, so a
// relative baseUrl works in production. The Vite dev server proxies `/api` to
// the backend during development.
//
// Node/JS here is BUILD-TIME ONLY — this ships as part of the static SPA bundle,
// never as a server runtime.

import createClient from "openapi-fetch";
import type { paths } from "./schema";

/** Base path for the StudyRover API, matching the OpenAPI `servers` entry. */
export const API_BASE_URL = "/studyrover/api";

/**
 * The shared, contract-typed API client. Import the named methods you need:
 *
 *   import { api } from "@/api/client";
 *   const { data, error } = await api.GET("/subjects", { params: { query: { page: 1 } } });
 *
 * Cookies (the sr_session HTTP-only session) are sent automatically with
 * same-origin requests, so the parent/student session flows transparently.
 */
export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  credentials: "include",
});

export default api;
