-- 0002_parent — Parent + Credential tables (contract C08).
-- Parent: { id, displayName, email(unique), createdAt }.
-- Credential: { id, parentId(fk), credentialId(unique), publicKey, counter(int),
--               isBackup(bool default false) } — a parent may have many
--               WebAuthn credentials, including backup authenticators.

CREATE TABLE parent (
    id           text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    display_name text        NOT NULL,
    email        text        NOT NULL UNIQUE,
    created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credential (
    id            text        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    parent_id     text        NOT NULL REFERENCES parent (id) ON DELETE CASCADE,
    credential_id bytea       NOT NULL UNIQUE,
    public_key    bytea       NOT NULL,
    counter       bigint      NOT NULL DEFAULT 0,
    is_backup     boolean     NOT NULL DEFAULT false
);

-- Credentials are most often looked up by their owning parent.
CREATE INDEX credential_parent_id_idx ON credential (parent_id);
