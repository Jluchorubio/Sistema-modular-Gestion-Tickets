-- Migration 041: Change asset_assignments.user_id FK to ON DELETE SET NULL
-- Rationale: deleting a user should preserve assignment history with user_id = NULL,
-- not cascade-delete the assignment records (audit trail loss).

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

  RAISE NOTICE 'Re-added fk_asset_assignments_user_id with ON DELETE SET NULL';
END;
$$;
