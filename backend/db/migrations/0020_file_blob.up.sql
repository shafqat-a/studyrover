-- 0020_file_blob — File blob metadata (contract 2-D08).
-- Metadata for files stored by 2-F07 storage. `ref` links to the storage backend.
-- Fields: id, ref(unique), filename, content_type, size_bytes, created_at.

CREATE TABLE file_blob (
    id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    ref          text        NOT NULL UNIQUE,
    filename     text        NOT NULL,
    content_type text        NOT NULL,
    size_bytes   bigint      NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);
