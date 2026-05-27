-- ============================================================
-- 015_critical_constraints.sql
-- DB-level constraints for data integrity
-- Apply on Railway: psql $DATABASE_URL -f 015_critical_constraints.sql
-- ============================================================

-- ── Priority formula: weights must sum to ~1.0 (±1%) ────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_priority_weights_sum'
      AND table_schema = 'config'
      AND table_name = 'priority_formula'
  ) THEN
    ALTER TABLE config.priority_formula
      ADD CONSTRAINT chk_priority_weights_sum
      CHECK (ABS((w_cargo + w_nodo + w_daño) - 1.0) < 0.015);
  END IF;
END $$;

-- ── Priority formula: thresholds must be ordered ─────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_priority_thresholds_order'
      AND table_schema = 'config'
      AND table_name = 'priority_formula'
  ) THEN
    ALTER TABLE config.priority_formula
      ADD CONSTRAINT chk_priority_thresholds_order
      CHECK (threshold_critica > threshold_alta
         AND threshold_alta    > threshold_media
         AND threshold_media   > 0);
  END IF;
END $$;

-- ── Priority formula: individual weights must be positive ────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_priority_weights_positive'
      AND table_schema = 'config'
      AND table_name = 'priority_formula'
  ) THEN
    ALTER TABLE config.priority_formula
      ADD CONSTRAINT chk_priority_weights_positive
      CHECK (w_cargo > 0 AND w_nodo > 0 AND w_daño > 0);
  END IF;
END $$;

-- ── config.sla_rules: hours must be positive ─────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_sla_rules_hours_positive'
      AND table_schema = 'config'
      AND table_name = 'sla_rules'
  ) THEN
    ALTER TABLE config.sla_rules
      ADD CONSTRAINT chk_sla_rules_hours_positive
      CHECK (hours_to_resolve > 0 AND hours_to_first_response > 0);
  END IF;
END $$;

-- ── config.business_hours: start before end ──────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_business_hours_order'
      AND table_schema = 'config'
      AND table_name = 'business_hours'
  ) THEN
    ALTER TABLE config.business_hours
      ADD CONSTRAINT chk_business_hours_order
      CHECK (start_time < end_time);
  END IF;
END $$;

-- ── org.nodes: no self-reference ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_org_nodes_no_self_parent'
      AND table_schema = 'org'
      AND table_name = 'nodes'
  ) THEN
    ALTER TABLE org.nodes
      ADD CONSTRAINT chk_org_nodes_no_self_parent
      CHECK (id != parent_id);
  END IF;
END $$;

-- ── org.nodes: weight must be between 1 and 10 ───────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'chk_org_nodes_weight_range'
      AND table_schema = 'org'
      AND table_name = 'nodes'
  ) THEN
    ALTER TABLE org.nodes
      ADD CONSTRAINT chk_org_nodes_weight_range
      CHECK (weight >= 1 AND weight <= 10);
  END IF;
END $$;

-- ── tickets.damage_types: weight in range ────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'tickets' AND table_name = 'damage_types'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = 'chk_damage_type_weight_range'
        AND table_schema = 'tickets'
        AND table_name = 'damage_types'
    ) THEN
      ALTER TABLE tickets.damage_types
        ADD CONSTRAINT chk_damage_type_weight_range
        CHECK (weight >= 1 AND weight <= 10);
    END IF;
  END IF;
END $$;

-- ── Performance indexes ───────────────────────────────────────

-- Tickets: frequent queries by module + status
CREATE INDEX IF NOT EXISTS idx_tickets_module_status
  ON tickets.tickets(module_id, status)
  WHERE deleted_at IS NULL;

-- Tickets: SLA deadline monitoring (only open tickets)
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline
  ON tickets.tickets(sla_deadline)
  WHERE status NOT IN ('CERRADO', 'CANCELADO')
    AND deleted_at IS NULL;

-- Tickets: creator + date for personal ticket views
CREATE INDEX IF NOT EXISTS idx_tickets_creator_created
  ON tickets.tickets(creator_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Org nodes: tree traversal
CREATE INDEX IF NOT EXISTS idx_org_nodes_parent
  ON org.nodes(parent_id)
  WHERE is_active = TRUE;

-- Users: lookup by email (auth)
CREATE INDEX IF NOT EXISTS idx_user_credentials_email
  ON auth.user_credentials(email);

-- ── Verify migration 002 placeholder ─────────────────────────
-- Migration 002 is missing from the sequence (001 → 003).
-- This is safe — no schema depends on a missing 002.
-- Document the gap here to prevent confusion on fresh deploys.
-- If 002 is ever needed, create it as 002_backfill_name.sql.

SELECT 'Migration 015_critical_constraints applied successfully' AS status;
