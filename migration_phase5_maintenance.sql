-- Phase 5: Module maintenance mode
ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS maintenance_mode    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS maintenance_by      UUID         NULL REFERENCES users.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS maintenance_since   TIMESTAMPTZ  NULL,
  ADD COLUMN IF NOT EXISTS maintenance_message TEXT         NULL;

COMMENT ON COLUMN modules.modules.maintenance_mode    IS 'When true, non-admin users cannot access this module.';
COMMENT ON COLUMN modules.modules.maintenance_by      IS 'User who activated maintenance mode.';
COMMENT ON COLUMN modules.modules.maintenance_since   IS 'Timestamp when maintenance mode was activated.';
COMMENT ON COLUMN modules.modules.maintenance_message IS 'Optional message shown to blocked users.';
