-- ============================================================
-- 016_sla_pause_columns.sql
-- Adds pause tracking to ticket_sla_tracking.
-- Apply on Railway: psql $DATABASE_URL -f 016_sla_pause_columns.sql
-- ============================================================

-- paused_at: when the SLA clock was last paused (EN_ESPERA transition)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tickets' AND table_name = 'ticket_sla_tracking'
      AND column_name = 'paused_at'
  ) THEN
    ALTER TABLE tickets.ticket_sla_tracking
      ADD COLUMN paused_at timestamptz NULL;
  END IF;
END $$;

-- total_paused_seconds: cumulative pause time across all EN_ESPERA periods
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'tickets' AND table_name = 'ticket_sla_tracking'
      AND column_name = 'total_paused_seconds'
  ) THEN
    ALTER TABLE tickets.ticket_sla_tracking
      ADD COLUMN total_paused_seconds integer NOT NULL DEFAULT 0;
  END IF;
END $$;

SELECT 'Migration 016_sla_pause_columns applied successfully' AS status;
