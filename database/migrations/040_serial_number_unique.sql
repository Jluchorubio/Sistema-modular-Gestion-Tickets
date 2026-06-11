-- Migration 040: UNIQUE constraint on inventory.assets.serial_number
-- Allows NULL (assets without serial number) but enforces uniqueness when present.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'inventory'
      AND tablename  = 'assets'
      AND indexname  = 'uq_assets_serial_number'
  ) THEN
    -- Remove exact-duplicate serial numbers before adding constraint (keep most recent)
    DELETE FROM inventory.assets a
    WHERE serial_number IS NOT NULL
      AND deleted_at IS NULL
      AND id NOT IN (
        SELECT DISTINCT ON (serial_number) id
        FROM inventory.assets
        WHERE serial_number IS NOT NULL AND deleted_at IS NULL
        ORDER BY serial_number, created_at DESC
      );

    CREATE UNIQUE INDEX uq_assets_serial_number
      ON inventory.assets (serial_number)
      WHERE serial_number IS NOT NULL;

    RAISE NOTICE 'Unique index uq_assets_serial_number created on inventory.assets';
  ELSE
    RAISE NOTICE 'Index uq_assets_serial_number already exists';
  END IF;
END;
$$;
