-- Allow 'codex' as a knowledge backend (Codex CLI on the operator's own
-- ChatGPT/Codex subscription).
ALTER TABLE settings DROP CONSTRAINT settings_knowledge_backend_check;
ALTER TABLE settings ADD CONSTRAINT settings_knowledge_backend_check
    CHECK (knowledge_backend IN ('notebooklm', 'gemini', 'ollama', 'zai', 'codex'));
