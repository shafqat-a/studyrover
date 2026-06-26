// StudyRover — openapi-typescript configuration (F06)
//
// Generates the TypeScript type definitions for the frozen OpenAPI contract.
// The assembled root (contracts/openapi.yaml, owned by W01) is the input; the
// emitted `schema.d.ts` is consumed by the typed `openapi-fetch` client
// (frontend/src/api/client.ts, owned by W01/W03) and by the TanStack Query
// hooks (H-tasks). Frontend never redefines a contract shape — it imports
// these generated types.
//
// Invoked by `make gen-ts` -> `pnpm --dir frontend run gen`. The `gen` script
// (owned by F05/W01 in package.json) calls:
//
//     openapi-typescript -c ../contracts/openapi-ts.config.ts
//
// Paths are relative to the frontend/ directory, where the command runs.
//
// Node/JS here is BUILD-TIME ONLY — this never ships in the production runtime.

import type { OpenAPITSOptions } from "openapi-typescript";

interface OpenAPITSConfig extends OpenAPITSOptions {
  /** Input OpenAPI document (assembled root owned by W01). */
  input: string;
  /** Emitted TypeScript declaration file consumed by src/api. */
  output: string;
}

const config: OpenAPITSConfig = {
  // The assembled OpenAPI 3.1 root, resolved from the frontend/ cwd.
  input: "../contracts/openapi.yaml",

  // Generated types land alongside the typed client in src/api.
  output: "src/api/schema.d.ts",

  // Emit `enum` instead of string unions so enums are usable as values
  // (e.g. SourceType.file) in components and hooks.
  enum: true,

  // Treat schemas without `additionalProperties: false` as not allowing extra
  // keys, keeping generated objects tight against the frozen contract.
  additionalProperties: false,

  // Use `string` for `format: date-time` (RFC 3339 strings per CONTRACTS.md)
  // rather than the `Date` object, matching JSON-over-HTTP transport.
  transform(schemaObject) {
    if (schemaObject.format === "date-time") {
      return { schema: "string", questionToken: true };
    }
    return undefined;
  },
};

export default config;
