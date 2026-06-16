-- Migration 046: Soft-delete for knowledge articles, posts and replies
-- Enables the "Eliminados" section within Knowledge (Helpdesk)

ALTER TABLE tickets.knowledge_articles
  ADD COLUMN IF NOT EXISTS deleted_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ;

ALTER TABLE tickets.knowledge_posts
  ADD COLUMN IF NOT EXISTS deleted_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ;

ALTER TABLE tickets.knowledge_replies
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_deleted
  ON tickets.knowledge_articles(deleted_at) WHERE deleted_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_deleted
  ON tickets.knowledge_posts(deleted_at) WHERE deleted_at IS NOT NULL;
