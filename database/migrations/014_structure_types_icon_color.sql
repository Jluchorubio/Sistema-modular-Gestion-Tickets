-- Migration 014: Add icon and color to org.structure_types
BEGIN;

ALTER TABLE org.structure_types
  ADD COLUMN IF NOT EXISTS icon  varchar(50)  DEFAULT 'folder',
  ADD COLUMN IF NOT EXISTS color varchar(20)  DEFAULT '#64748b';

-- Update default seed types with meaningful icons/colors
UPDATE org.structure_types SET icon = 'map-pin',    color = '#0e2235' WHERE slug = 'sede';
UPDATE org.structure_types SET icon = 'layers',      color = '#4f46e5' WHERE slug = 'departamento';
UPDATE org.structure_types SET icon = 'grid',        color = '#0891b2' WHERE slug = 'area';
UPDATE org.structure_types SET icon = 'briefcase',   color = '#059669' WHERE slug = 'cargo';

COMMIT;

-- VERIFY
-- SELECT slug, icon, color FROM org.structure_types;
