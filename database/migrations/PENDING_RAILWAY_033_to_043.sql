-- =============================================================================
-- MIGRATIONS PENDIENTES RAILWAY: 033 → 043
-- Aplicar EN ORDEN después de PENDING_RAILWAY_025_to_032.sql.
-- TODAS IDEMPOTENTES — seguro correr aunque alguna ya esté aplicada.
-- Railway: Data → Query → pegar todo y ejecutar.
-- =============================================================================

-- ─── Migration 033: Documentar skip FKs particionadas (no-op) ────────────────
SELECT 'Migration 033: partition FK skip documented — no action needed' AS status;


-- ─── Migration 034: Índices faltantes ────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_assets_parent_asset_id
  ON inventory.assets(parent_asset_id);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_policy_id
  ON tickets.tickets(sla_policy_id)
  WHERE sla_policy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded_by
  ON tickets.ticket_attachments(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_created_by
  ON tickets.knowledge_posts(created_by);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_updated_by
  ON tickets.knowledge_posts(updated_by)
  WHERE updated_by IS NOT NULL;


-- ─── Migration 035: DB cleanup — tablas muertas y outbox huérfano ────────────

DROP TABLE IF EXISTS modules.technician_assignment_log CASCADE;
DROP TABLE IF EXISTS tickets.technician_availability CASCADE;
DO $$
BEGIN
  -- technician_load puede ser tabla o vista según el entorno
  IF EXISTS (SELECT 1 FROM information_schema.tables  WHERE table_schema='reports' AND table_name='technician_load' AND table_type='BASE TABLE') THEN
    DROP TABLE reports.technician_load CASCADE;
  ELSIF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='reports' AND table_name='technician_load') THEN
    DROP VIEW reports.technician_load CASCADE;
  END IF;
END $$;
DROP SCHEMA IF EXISTS maintenance CASCADE;

DELETE FROM events.outbox
WHERE status = 'pending'
  AND created_at < now() - INTERVAL '7 days';


-- ─── Migration 036: waiting_timeout_hours + approval reminder tracking ────────

ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS waiting_timeout_hours INTEGER DEFAULT 72
    CONSTRAINT chk_waiting_timeout_hours
      CHECK (waiting_timeout_hours > 0 AND waiting_timeout_hours <= 2160);

ALTER TABLE tickets.ticket_approvals
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;


-- ─── Migration 037: Permisos base para rol "usuario" global ──────────────────

INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name = 'usuario'
  AND  pd.key IN (
    'global:system:access',
    'global:sidebar:view',
    'global:sidebar:dashboard',
    'global:dashboard:view',
    'global:dashboard:modules_view',
    'gestion:requests:view_own',
    'gestion:requests:create',
    'helpdesk:tickets:view',
    'helpdesk:tickets:create',
    'helpdesk:comments:add',
    'inventario:items:view'
  )
  AND  pd.is_active = true
ON CONFLICT (role_id, permission_key) DO NOTHING;


-- ─── Migration 038: Grants para roles de Gestión Administrativa ───────────────

DO $$
DECLARE
  v_admin_id  uuid;
  v_tech_id   uuid;
  v_jefe_id   uuid;
BEGIN
  SELECT mr.id INTO v_admin_id
  FROM modules.module_roles mr
  JOIN modules.modules m ON m.id = mr.module_id
  WHERE m.permission_scope = 'gestion' AND mr.name = 'admin_modulo' AND m.deleted_at IS NULL
  LIMIT 1;

  SELECT mr.id INTO v_tech_id
  FROM modules.module_roles mr
  JOIN modules.modules m ON m.id = mr.module_id
  WHERE m.permission_scope = 'gestion' AND mr.name = 'tecnico' AND m.deleted_at IS NULL
  LIMIT 1;

  SELECT mr.id INTO v_jefe_id
  FROM modules.module_roles mr
  JOIN modules.modules m ON m.id = mr.module_id
  WHERE m.permission_scope = 'gestion' AND mr.name = 'jefe_tecnico' AND m.deleted_at IS NULL
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE WARNING 'admin_modulo role not found for gestion module — skipping 038';
    RETURN;
  END IF;

  INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
  SELECT v_admin_id, 'module', pd.key
  FROM config.permission_definitions pd
  WHERE pd.scope = 'gestion'
  ON CONFLICT DO NOTHING;

  IF v_jefe_id IS NOT NULL THEN
    INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
    VALUES
      (v_jefe_id, 'module', 'gestion:requests:view_own'),
      (v_jefe_id, 'module', 'gestion:requests:view_all'),
      (v_jefe_id, 'module', 'gestion:requests:create'),
      (v_jefe_id, 'module', 'gestion:requests:take'),
      (v_jefe_id, 'module', 'gestion:requests:progress'),
      (v_jefe_id, 'module', 'gestion:requests:approve'),
      (v_jefe_id, 'module', 'gestion:requests:reject'),
      (v_jefe_id, 'module', 'gestion:requests:escalate'),
      (v_jefe_id, 'module', 'gestion:reports:view'),
      (v_jefe_id, 'module', 'gestion:users:view')
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_tech_id IS NOT NULL THEN
    INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
    VALUES
      (v_tech_id, 'module', 'gestion:requests:view_own'),
      (v_tech_id, 'module', 'gestion:requests:view_all'),
      (v_tech_id, 'module', 'gestion:requests:create'),
      (v_tech_id, 'module', 'gestion:requests:take'),
      (v_tech_id, 'module', 'gestion:requests:progress'),
      (v_tech_id, 'module', 'gestion:requests:approve'),
      (v_tech_id, 'module', 'gestion:requests:reject'),
      (v_tech_id, 'module', 'gestion:reports:view')
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Migration 038 complete — gestion role grants seeded';
END $$;


-- ─── Migration 039: global:users:view para jefe_tecnico ──────────────────────

INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
CROSS  JOIN config.permission_definitions pd
WHERE  mr.name = 'jefe_tecnico'
  AND  mr.is_active = true
  AND  pd.key IN ('global:users:view')
  AND  pd.is_active = true
ON CONFLICT (role_id, permission_key) DO NOTHING;


-- ─── Migration 040: UNIQUE en inventory.assets.serial_number ─────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'inventory'
      AND tablename  = 'assets'
      AND indexname  = 'uq_assets_serial_number'
  ) THEN
    DELETE FROM inventory.assets a
    WHERE serial_number IS NOT NULL
      AND deleted_at IS NULL
      AND id NOT IN (
        SELECT DISTINCT ON (serial_number) id
        FROM inventory.assets
        WHERE serial_number IS NOT NULL AND deleted_at IS NULL
        ORDER BY serial_number, created_at DESC
      );

    CREATE UNIQUE INDEX uq_assets_serial_number
      ON inventory.assets (serial_number)
      WHERE serial_number IS NOT NULL;

    RAISE NOTICE 'Unique index uq_assets_serial_number created';
  ELSE
    RAISE NOTICE 'Index uq_assets_serial_number already exists';
  END IF;
END;
$$;


-- ─── Migration 041: asset_assignments.user_id FK → ON DELETE SET NULL ────────

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema     = 'inventory'
      AND table_name       = 'asset_assignments'
      AND constraint_name  = 'fk_asset_assignments_user_id'
  ) THEN
    ALTER TABLE inventory.asset_assignments
      DROP CONSTRAINT fk_asset_assignments_user_id;
    RAISE NOTICE 'Dropped fk_asset_assignments_user_id';
  END IF;

  ALTER TABLE inventory.asset_assignments
    ALTER COLUMN user_id DROP NOT NULL;

  ALTER TABLE inventory.asset_assignments
    ADD CONSTRAINT fk_asset_assignments_user_id
    FOREIGN KEY (user_id) REFERENCES users.profiles(id) ON DELETE SET NULL;

  RAISE NOTICE 'Re-added fk_asset_assignments_user_id con ON DELETE SET NULL';
END;
$$;


-- ─── Migration 042: scheduled_hard_delete_at en assets + CHECK no self-loop ──

ALTER TABLE inventory.assets
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'tickets'
      AND table_name        = 'transitions'
      AND constraint_name   = 'chk_transitions_no_self_loop'
  ) THEN
    ALTER TABLE tickets.transitions
      ADD CONSTRAINT chk_transitions_no_self_loop
      CHECK (from_state_id <> to_state_id);
    RAISE NOTICE 'chk_transitions_no_self_loop added';
  ELSE
    RAISE NOTICE 'chk_transitions_no_self_loop already exists';
  END IF;
END;
$$;


-- ─── Migration 043: FK para requests.admin_requests.assigned_to ──────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema    = 'requests'
      AND table_name      = 'admin_requests'
      AND constraint_name = 'fk_admin_requests_assigned_to'
  ) THEN
    UPDATE requests.admin_requests
    SET assigned_to = NULL
    WHERE assigned_to IS NOT NULL
      AND assigned_to NOT IN (SELECT id FROM users.profiles);

    ALTER TABLE requests.admin_requests
      ADD CONSTRAINT fk_admin_requests_assigned_to
      FOREIGN KEY (assigned_to)
      REFERENCES users.profiles(id)
      ON DELETE SET NULL;

    RAISE NOTICE 'FK fk_admin_requests_assigned_to creada';
  ELSE
    RAISE NOTICE 'FK fk_admin_requests_assigned_to ya existe';
  END IF;
END;
$$;


-- =============================================================================
-- FIN — migraciones 033–043 aplicadas
-- =============================================================================
