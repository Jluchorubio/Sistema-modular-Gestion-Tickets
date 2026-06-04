-- =============================================================================
-- MIGRATIONS PENDIENTES RAILWAY: 025 → 032
-- Aplicar EN ORDEN después de PENDING_RAILWAY_024.sql.
-- TODAS IDEMPOTENTES — seguro correr aunque alguna ya esté parcialmente aplicada.
-- Railway: Data → Query → pegar todo y ejecutar.
-- =============================================================================

-- ─── Migration 025: Escalation columns in tickets.tickets ────────────────────
-- (025 fue aplicada vía Node script 2026-06-03 — incluida aquí por idempotencia)

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS escalated       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_note TEXT;

-- ─── Migration 026: Base de conocimiento Helpdesk ────────────────────────────

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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_knowledge_articles_updated_at'
  ) THEN
    CREATE TRIGGER trg_knowledge_articles_updated_at
      BEFORE UPDATE ON tickets.knowledge_articles
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

-- ─── Migration 027: access_mode = 'open' para módulos built-in ───────────────

UPDATE modules.modules
SET access_mode = 'open'
WHERE type IN ('inventario', 'inventory', 'gestion', 'administrative')
  AND deleted_at IS NULL;

-- ─── Migration 028: deleted_at (soft-delete) en tickets.tickets ──────────────

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS deleted_at                 timestamptz,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_tickets_not_deleted
  ON tickets.tickets (module_id, created_at)
  WHERE deleted_at IS NULL;

-- ─── Migration 029: allowed_roles en transitions ─────────────────────────────
-- (Supersedida por 032 — incluida por consistencia histórica)

ALTER TABLE tickets.transitions
  ADD COLUMN IF NOT EXISTS allowed_roles text[] DEFAULT '{}';

-- ─── Migration 030: Knowledge forum tables + article enhancements ────────────

ALTER TABLE tickets.knowledge_articles
  ADD COLUMN IF NOT EXISTS status            varchar(20) NOT NULL DEFAULT 'published',
  ADD COLUMN IF NOT EXISTS helpful_count     integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS not_helpful_count integer     NOT NULL DEFAULT 0;

ALTER TABLE tickets.knowledge_articles
  DROP CONSTRAINT IF EXISTS knowledge_articles_status_check;
ALTER TABLE tickets.knowledge_articles
  ADD CONSTRAINT knowledge_articles_status_check
    CHECK (status IN ('draft', 'pending_review', 'published'));

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

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_module
  ON tickets.knowledge_posts (module_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tickets.knowledge_replies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid        NOT NULL REFERENCES tickets.knowledge_posts(id) ON DELETE CASCADE,
  content     text        NOT NULL,
  is_accepted boolean     NOT NULL DEFAULT false,
  created_by  uuid        NOT NULL REFERENCES users.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_replies_post
  ON tickets.knowledge_replies (post_id, created_at);

CREATE TABLE IF NOT EXISTS tickets.knowledge_votes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users.profiles(id),
  entity_id   uuid        NOT NULL,
  entity_type varchar(10) NOT NULL CHECK (entity_type IN ('article', 'post', 'reply')),
  value       smallint    NOT NULL CHECK (value IN (1, -1)),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, entity_id, entity_type)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_votes_entity
  ON tickets.knowledge_votes (entity_id, entity_type);

-- ─── Migration 031: File support en knowledge_articles ───────────────────────

ALTER TABLE tickets.knowledge_articles
  ADD COLUMN IF NOT EXISTS doc_type  varchar(10) NOT NULL DEFAULT 'article',
  ADD COLUMN IF NOT EXISTS file_url  text,
  ADD COLUMN IF NOT EXISTS file_name varchar,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS file_mime varchar;

ALTER TABLE tickets.knowledge_articles
  DROP CONSTRAINT IF EXISTS knowledge_articles_doc_type_check;
ALTER TABLE tickets.knowledge_articles
  ADD CONSTRAINT knowledge_articles_doc_type_check
    CHECK (doc_type IN ('article', 'file'));

CREATE INDEX IF NOT EXISTS idx_knowledge_articles_doc_type
  ON tickets.knowledge_articles (module_id, doc_type);

-- ─── Migration 032: FSM complete fix ─────────────────────────────────────────
-- CRÍTICO: is_approval_state y is_pause_state faltaban — sin esto:
--   • auto-close cron nunca cierra tickets
--   • rating timing incorrecto (backend bloqueaba rating en resuelto)
--   • variant faltante → dropdown acciones puede crashear
--   • allowed_roles vacío → filtro de transitions no filtra nada

-- 1. Columnas faltantes en states
ALTER TABLE tickets.states
  ADD COLUMN IF NOT EXISTS is_approval_state boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pause_state    boolean NOT NULL DEFAULT false;

-- 2. Columnas faltantes en transitions
ALTER TABLE tickets.transitions
  ADD COLUMN IF NOT EXISTS variant       varchar(50) DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS allowed_roles text[]      DEFAULT '{}';

-- 3. Flags de estados por nombre (cubre nombres viejos y nuevos)
UPDATE tickets.states
SET is_approval_state = true
WHERE name IN ('realizado', 'resuelto')
  AND is_approval_state = false;

UPDATE tickets.states
SET is_pause_state = true
WHERE name = 'en_espera'
  AND is_pause_state = false;

UPDATE tickets.states
SET is_final = true
WHERE name IN ('reproceso', 'rechazado')
  AND is_final = false;

-- 4. Variant por nombre de transición
UPDATE tickets.transitions SET variant = 'primary'
WHERE name IN ('Tomar ticket', 'Reanudar', 'Marcar resuelto', 'Marcar realizado');

UPDATE tickets.transitions SET variant = 'warning'
WHERE name IN ('Solicitar información');

UPDATE tickets.transitions SET variant = 'success'
WHERE name IN ('Aprobar y cerrar', 'Cerrar');

UPDATE tickets.transitions SET variant = 'danger'
WHERE name IN ('Rechazar', 'Rechazar solución', 'Retomar para reproceso');

UPDATE tickets.transitions
SET variant = 'default'
WHERE variant IS NULL;

-- 5. allowed_roles por nombre de transición (supersede 029)
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name IN ('Tomar ticket', 'Solicitar información', 'Reanudar',
               'Marcar resuelto', 'Marcar realizado',
               'Retomar para reproceso');

UPDATE tickets.transitions
SET allowed_roles = ARRAY['jefe_tecnico', 'admin_modulo']
WHERE name = 'Rechazar';

UPDATE tickets.transitions
SET allowed_roles = ARRAY['usuario', 'jefe_tecnico', 'admin_modulo']
WHERE name IN ('Aprobar y cerrar', 'Cerrar', 'Reabrir', 'Rechazar solución');

-- =============================================================================
-- FIN — todas las migraciones 025-032 aplicadas
-- =============================================================================
