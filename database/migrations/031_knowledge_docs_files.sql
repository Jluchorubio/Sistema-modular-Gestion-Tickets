-- Migration 031: File support in knowledge_articles
-- IDEMPOTENTE.

ALTER TABLE tickets.knowledge_articles
  ADD COLUMN IF NOT EXISTS doc_type  varchar(10) NOT NULL DEFAULT 'article'
    CHECK (doc_type IN ('article', 'file')),
  ADD COLUMN IF NOT EXISTS file_url  text,
  ADD COLUMN IF NOT EXISTS file_name varchar,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_mime varchar;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_doc_type
  ON tickets.knowledge_articles(module_id, doc_type);
