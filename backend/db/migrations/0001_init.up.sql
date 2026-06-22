-- 0001_init — base migration: extensions and shared helpers (task D12).
--
-- This runs before every table migration (numbers are fixed; 0002+ are tables).
-- It contains NO tables; only the extension required for ID generation and an
-- optional trigger helper that table migrations may attach to an updated_at column.
--
-- Project conventions (documented here, applied by 0002+ table migrations):
--   * Primary keys: `id text PRIMARY KEY DEFAULT gen_random_uuid()::text`
--     (the contract exposes ids as strings; text serializes to a string in JSON).
--   * Enums: plain `text` columns guarded by `CHECK (col IN (...))` constraints
--     rather than native Postgres ENUM types — this keeps sqlc models simple
--     (Go `string`) and lets the contract's enum stay the single source of truth.
--   * Timestamps: `timestamptz NOT NULL DEFAULT now()` (RFC 3339 over the wire).

-- gen_random_uuid()::text lives in pgcrypto on the Postgres versions we target.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Shared trigger helper: sets NEW.updated_at to now() on UPDATE. Table
-- migrations that carry an `updated_at` column attach this via:
--   CREATE TRIGGER <table>_set_updated_at
--       BEFORE UPDATE ON <table>
--       FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
