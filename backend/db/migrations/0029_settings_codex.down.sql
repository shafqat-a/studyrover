-- Revert to the pre-codex backend set; a stored 'codex' falls back to the default.
UPDATE settings SET knowledge_backend = 'notebooklm' WHERE knowledge_backend = 'codex';
ALTER TABLE settings DROP CONSTRAINT settings_knowledge_backend_check;
ALTER TABLE settings ADD CONSTRAINT settings_knowledge_backend_check
    CHECK (knowledge_backend IN ('notebooklm', 'gemini', 'ollama', 'zai'));
