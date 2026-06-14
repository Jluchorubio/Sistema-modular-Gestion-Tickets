-- 045_damage_types_module_scope.sql
-- Añade module_id a tickets.damage_types para soporte de tipos por módulo.
-- NULL = global (aplica a todos los módulos)
-- non-null = específico del módulo (sobreescribe / complementa los globales)

ALTER TABLE tickets.damage_types
  ADD COLUMN IF NOT EXISTS module_id uuid
  REFERENCES modules.modules(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_damage_types_module_id
  ON tickets.damage_types(module_id);

-- Los tipos existentes son globales (module_id stays NULL).
