-- Migration 018: Fix performance indexes that failed in 015
-- 015 used wrong column names (deleted_at/status/creator_id/auth.user_credentials)
-- Actual schema: no deleted_at on tickets, status is current_state_id, creator=created_by, table=auth.credentials

CREATE INDEX IF NOT EXISTS idx_tickets_module_status
  ON tickets.tickets(module_id, current_state_id);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline
  ON tickets.tickets(sla_deadline)
  WHERE sla_deadline IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_creator_created
  ON tickets.tickets(created_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_credentials_email
  ON auth.credentials(email);

SELECT 'Migration 018_fix_indexes applied successfully' AS status;
