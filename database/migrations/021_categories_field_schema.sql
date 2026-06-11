-- Migration 021: campo dinámico por categoría
-- field_schema define los campos extra que aparecen en el formulario de activo/ticket
-- cuando el usuario elige una categoría específica.
-- Formato: [{ "key": "brand", "label": "Marca", "type": "text", "required": true }, ...]
-- Tipos soportados: text | number | date | select | boolean

ALTER TABLE modules.categories
  ADD COLUMN IF NOT EXISTS field_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE modules.categories
  ADD CONSTRAINT chk_categories_field_schema_is_array
    CHECK (jsonb_typeof(field_schema) = 'array');

COMMENT ON COLUMN modules.categories.field_schema IS
  'Campos dinámicos para el formulario al elegir esta categoría. Array de { key, label, type, required?, options? }.';
