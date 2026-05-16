-- ─── Migration: Escalación de solicitudes ────────────────────────────────────
-- Adds escalation flag + metadata to admin_requests.
-- An escalation is a flag (not a status change) so the normal flow keeps working.
-- Run: node -e "require('./run_migration')('migration_escalation.sql')"

ALTER TABLE requests.admin_requests
  ADD COLUMN IF NOT EXISTS escalated       BOOLEAN     NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS escalated_by    UUID        REFERENCES users.profiles(id),
  ADD COLUMN IF NOT EXISTS escalated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_note TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_requests_escalated
  ON requests.admin_requests (escalated)
  WHERE escalated = TRUE;
