-- Migration 020: soft-delete columns for org.structure_types
-- Allows TypesTab delete button → soft-delete → 90-day trash retention

ALTER TABLE org.structure_types
  ADD COLUMN IF NOT EXISTS deleted_at               TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ NULL;

-- Ensure getStructureTypes query still works (existing rows have NULL deleted_at → treated as active)
CREATE INDEX IF NOT EXISTS idx_structure_types_not_deleted
  ON org.structure_types (is_active)
  WHERE deleted_at IS NULL;
