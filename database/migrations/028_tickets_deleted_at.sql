-- Migration 028: Add deleted_at (soft-delete) to tickets.tickets
-- Column was referenced in service code but never added via migration.
-- Propagates automatically to all RANGE partitions.
-- IDEMPOTENTE.

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Partial index: only non-deleted tickets (improves most query performance)
CREATE INDEX IF NOT EXISTS idx_tickets_not_deleted
  ON tickets.tickets (module_id, created_at)
  WHERE deleted_at IS NULL;

-- Also add scheduled_hard_delete_at for trash system consistency
ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at timestamptz;
