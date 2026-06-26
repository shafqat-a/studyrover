-- 0001_init (down) — reverse the base migration (task D12).
-- Drop the shared helper; leave pgcrypto in place since it may be a shared
-- cluster extension, but the helper function is owned by this migration.

DROP FUNCTION IF EXISTS set_updated_at();

DROP EXTENSION IF EXISTS pgcrypto;
