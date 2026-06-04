-- Migration 030: Knowledge forum tables + article enhancements
-- IDEMPOTENTE.

-- ── Extend knowledge_articles ──────────────────────────────────────────────
ALTER TABLE tickets.knowledge_articles
  ADD COLUMN IF NOT EXISTS status       varchar(20) NOT NULL DEFAULT 'published'
    CHECK (status IN ('draft', 'pending_review', 'published')),
  ADD COLUMN IF NOT EXISTS helpful_count integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_helpful_count integer NOT NULL DEFAULT 0;

-- ── Forum posts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.knowledge_posts (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id   uuid        NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
  title       varchar     NOT NULL,
  content     text        NOT NULL,
  tags        text[]      NOT NULL DEFAULT '{}',
  is_resolved boolean     NOT NULL DEFAULT false,
  view_count  integer     NOT NULL DEFAULT 0,
  created_by  uuid        NOT NULL REFERENCES users.profiles(id),
  updated_by  uuid        REFERENCES users.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_module ON tickets.knowledge_posts(module_id, created_at DESC);

-- ── Forum replies ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.knowledge_replies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES tickets.knowledge_posts(id) ON DELETE CASCADE,
  content     text        NOT NULL,
  is_accepted boolean     NOT NULL DEFAULT false,
  created_by  uuid        NOT NULL REFERENCES users.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_replies_post ON tickets.knowledge_replies(post_id, created_at);

-- ── Votes (articles + posts + replies) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.knowledge_votes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users.profiles(id),
  entity_id   uuid        NOT NULL,
  entity_type varchar(10) NOT NULL CHECK (entity_type IN ('article', 'post', 'reply')),
  value       smallint    NOT NULL CHECK (value IN (1, -1)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_votes_entity ON tickets.knowledge_votes(entity_id, entity_type);
