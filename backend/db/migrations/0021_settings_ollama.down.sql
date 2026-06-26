ALTER TABLE settings DROP CONSTRAINT settings_knowledge_backend_check;
ALTER TABLE settings ADD CONSTRAINT settings_knowledge_backend_check
    CHECK (knowledge_backend IN ('notebooklm', 'gemini'));
