-- Migration 042:
-- 1. Add scheduled_hard_delete_at to inventory.assets (required for trash system)
-- 2. Add CHECK constraint: a transition cannot loop to itself

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
