-- Allow 'ollama' as a knowledge backend (Ollama Cloud adapter).
ALTER TABLE settings DROP CONSTRAINT settings_knowledge_backend_check;
ALTER TABLE settings ADD CONSTRAINT settings_knowledge_backend_check
    CHECK (knowledge_backend IN ('notebooklm', 'gemini', 'ollama'));
