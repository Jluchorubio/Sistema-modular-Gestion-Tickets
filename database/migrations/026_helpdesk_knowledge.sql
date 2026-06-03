-- ============================================================
-- Migration 026: Base de conocimiento Helpdesk
-- IDEMPOTENTE
-- ============================================================

CREATE TABLE IF NOT EXISTS tickets.knowledge_articles (
  id            uuid         NOT NULL DEFAULT gen_random_uuid(),
  module_id     uuid         NOT NULL,
  title         varchar(300) NOT NULL,
  content       text         NOT NULL DEFAULT '',
  category      varchar(100),
  tags          text[]       NOT NULL DEFAULT '{}',
  is_published  boolean      NOT NULL DEFAULT false,
  view_count    integer      NOT NULL DEFAULT 0,
  created_by    uuid         NOT NULL,
  updated_by    uuid,
  ticket_id     uuid,
  created_at    timestamptz  NOT NULL DEFAULT now(),
  updated_at    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT pk_knowledge_articles PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_module
  ON tickets.knowledge_articles (module_id, is_published)
  WHERE is_published = true;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_tags
  ON tickets.knowledge_articles USING gin (tags);

CREATE TRIGGER trg_knowledge_articles_updated_at
  BEFORE UPDATE ON tickets.knowledge_articles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
