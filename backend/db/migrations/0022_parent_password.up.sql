-- 0022 — parent password fallback (passkey-less login).
--
-- Nullable by design: NULL means "no password configured", in which case the
-- server accepts the built-in default password for the passkey-unavailable
-- fallback (see internal/http/auth_password.go).
ALTER TABLE parent ADD COLUMN password_hash text;
