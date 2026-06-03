-- ============================================================
-- MIGRATIONS PENDIENTES RAILWAY: 024
-- Aplicar DESPUÉS de 019-023.
-- Idempotente — seguro correr más de una vez.
-- Aplicar en Railway: Data → Query → pegar y ejecutar.
-- ============================================================

-- Incluye el contenido completo de: 024_integrity_fks.sql

-- ── ticket_sla_tracking.ticket_id FK ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'tickets'
      AND table_name = 'ticket_sla_tracking'
      AND constraint_name = 'fk_ticket_sla_tracking_ticket_id'
  ) THEN
    ALTER TABLE tickets.ticket_sla_tracking
      ADD CONSTRAINT fk_ticket_sla_tracking_ticket_id
      FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK ticket_sla_tracking.ticket_id creada';
  ELSE
    RAISE NOTICE 'FK ticket_sla_tracking.ticket_id ya existe';
  END IF;
END;
$$;

-- ── ticket_assignments.user_id FK ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'tickets'
      AND table_name = 'ticket_assignments'
      AND constraint_name = 'fk_ticket_assignments_user_id'
  ) THEN
    DELETE FROM tickets.ticket_assignments ta
    WHERE NOT EXISTS (SELECT 1 FROM users.profiles p WHERE p.id = ta.user_id);

    ALTER TABLE tickets.ticket_assignments
      ADD CONSTRAINT fk_ticket_assignments_user_id
      FOREIGN KEY (user_id) REFERENCES users.profiles(id) ON DELETE SET NULL;
    RAISE NOTICE 'FK ticket_assignments.user_id creada';
  ELSE
    RAISE NOTICE 'FK ticket_assignments.user_id ya existe';
  END IF;
END;
$$;

-- ── ticket_assignments.ticket_id FK ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'tickets'
      AND table_name = 'ticket_assignments'
      AND constraint_name = 'fk_ticket_assignments_ticket_id'
  ) THEN
    DELETE FROM tickets.ticket_assignments ta
    WHERE NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id = ta.ticket_id);

    ALTER TABLE tickets.ticket_assignments
      ADD CONSTRAINT fk_ticket_assignments_ticket_id
      FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK ticket_assignments.ticket_id creada';
  ELSE
    RAISE NOTICE 'FK ticket_assignments.ticket_id ya existe';
  END IF;
END;
$$;

-- ── inventory.ticket_assets → tickets.tickets ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'inventory'
      AND table_name = 'ticket_assets'
      AND constraint_name = 'fk_ticket_assets_ticket_id'
  ) THEN
    DELETE FROM inventory.ticket_assets ta
    WHERE NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id = ta.ticket_id);

    ALTER TABLE inventory.ticket_assets
      ADD CONSTRAINT fk_ticket_assets_ticket_id
      FOREIGN KEY (ticket_id) REFERENCES tickets.tickets(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK ticket_assets.ticket_id creada';
  ELSE
    RAISE NOTICE 'FK ticket_assets.ticket_id ya existe';
  END IF;
END;
$$;

-- ── inventory.ticket_assets → inventory.assets ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'inventory'
      AND table_name = 'ticket_assets'
      AND constraint_name = 'fk_ticket_assets_asset_id'
  ) THEN
    DELETE FROM inventory.ticket_assets ta
    WHERE NOT EXISTS (SELECT 1 FROM inventory.assets a WHERE a.id = ta.asset_id);

    ALTER TABLE inventory.ticket_assets
      ADD CONSTRAINT fk_ticket_assets_asset_id
      FOREIGN KEY (asset_id) REFERENCES inventory.assets(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK ticket_assets.asset_id creada';
  ELSE
    RAISE NOTICE 'FK ticket_assets.asset_id ya existe';
  END IF;
END;
$$;

-- ── inventory.asset_assignments → users.profiles ──
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'inventory'
      AND table_name = 'asset_assignments'
      AND constraint_name = 'fk_asset_assignments_user_id'
  ) THEN
    DELETE FROM inventory.asset_assignments aa
    WHERE NOT EXISTS (SELECT 1 FROM users.profiles p WHERE p.id = aa.user_id);

    ALTER TABLE inventory.asset_assignments
      ADD CONSTRAINT fk_asset_assignments_user_id
      FOREIGN KEY (user_id) REFERENCES users.profiles(id) ON DELETE CASCADE;
    RAISE NOTICE 'FK asset_assignments.user_id creada';
  ELSE
    RAISE NOTICE 'FK asset_assignments.user_id ya existe';
  END IF;
END;
$$;
