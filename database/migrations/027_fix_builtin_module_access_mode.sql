-- Migration 027: Set access_mode = 'open' for built-in always-open modules
-- Inventory and Gestión Administrativa must always be freely accessible.
-- Default was 'request' which incorrectly blocked regular users.

UPDATE modules.modules
SET access_mode = 'open'
WHERE type IN ('inventario', 'inventory', 'gestion', 'administrative')
  AND deleted_at IS NULL;
