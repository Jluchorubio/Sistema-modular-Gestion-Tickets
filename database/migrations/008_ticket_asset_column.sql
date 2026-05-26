-- Migration 008: Add asset_id column to tickets.tickets
-- Apply: psql $DATABASE_URL -f migrations/008_ticket_asset_column.sql
--
-- Adds a direct asset reference to a ticket (the primary affected device).
-- Distinct from inventory.ticket_assets (many-to-many): this is the "main" asset.

BEGIN;

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS asset_id uuid
  REFERENCES inventory.assets(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_asset_id ON tickets.tickets (asset_id)
  WHERE asset_id IS NOT NULL;

COMMIT;

-- VERIFY
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'tickets' AND table_name = 'tickets' AND column_name = 'asset_id';
