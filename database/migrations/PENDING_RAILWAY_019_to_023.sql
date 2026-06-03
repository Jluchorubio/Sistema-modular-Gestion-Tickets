-- ============================================================
-- MIGRATIONS PENDIENTES RAILWAY: 019 → 023
-- Idempotentes — seguro correr aunque algunas ya estén aplicadas.
-- Aplicar en Railway: Data → Query → pegar todo y ejecutar.
-- ============================================================

-- ── Migration 019: specialization_mode + auto_close_hours ──
ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS specialization_mode TEXT NOT NULL DEFAULT 'general'
    CONSTRAINT chk_modules_specialization_mode
    CHECK (specialization_mode IN ('general', 'specialist', 'hybrid')),
  ADD COLUMN IF NOT EXISTS auto_close_hours INTEGER NOT NULL DEFAULT 48
    CONSTRAINT chk_auto_close_hours CHECK (auto_close_hours > 0 AND auto_close_hours <= 720);

-- ── Migration 020: soft-delete en org.structure_types ──
ALTER TABLE org.structure_types
  ADD COLUMN IF NOT EXISTS deleted_at               TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_structure_types_not_deleted
  ON org.structure_types (is_active)
  WHERE deleted_at IS NULL;

-- ── Migration 021: field_schema dinámico en modules.categories ──
ALTER TABLE modules.categories
  ADD COLUMN IF NOT EXISTS field_schema JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE modules.categories
  DROP CONSTRAINT IF EXISTS chk_categories_field_schema_is_array;

ALTER TABLE modules.categories
  ADD CONSTRAINT chk_categories_field_schema_is_array
    CHECK (jsonb_typeof(field_schema) = 'array');

-- ── Migration 022: field_schema por defecto para categorías de inventario ──
DO $$
DECLARE
  mod_inv UUID;
BEGIN
  SELECT id INTO mod_inv
  FROM modules.modules
  WHERE slug = 'inventario' AND deleted_at IS NULL;

  IF mod_inv IS NULL THEN
    RAISE WARNING 'Módulo inventario no encontrado — omitiendo 022';
    RETURN;
  END IF;

  UPDATE modules.categories
  SET field_schema = '[
    {"key":"marca","label":"Marca","type":"text","required":true},
    {"key":"modelo","label":"Modelo","type":"text","required":true},
    {"key":"nombre_equipo","label":"Nombre del equipo","type":"text","required":false},
    {"key":"tipo_equipo","label":"Tipo de equipo","type":"select","required":false,"options":["Desktop","Laptop","All-in-One","Servidor","Tablet","Mini PC"]},
    {"key":"sistema_operativo","label":"Sistema Operativo","type":"select","required":false,"options":["Windows 11","Windows 10","Windows Server 2022","Windows Server 2019","Ubuntu","Debian","macOS","Sin OS"]},
    {"key":"version_so","label":"Version SO","type":"text","required":false},
    {"key":"procesador","label":"Procesador","type":"text","required":false},
    {"key":"generacion_cpu","label":"Generacion procesador","type":"text","required":false},
    {"key":"ram","label":"RAM","type":"select","required":false,"options":["2GB","4GB","8GB","16GB","32GB","64GB","128GB"]},
    {"key":"tipo_ram","label":"Tipo de RAM","type":"select","required":false,"options":["DDR3","DDR4","DDR5","LPDDR4","LPDDR5"]},
    {"key":"almacenamiento","label":"Almacenamiento","type":"text","required":false},
    {"key":"tipo_almacenamiento","label":"Tipo almacenamiento","type":"select","required":false,"options":["HDD","SSD","NVMe SSD","eMMC","HDD + SSD"]},
    {"key":"tarjeta_grafica","label":"Tarjeta grafica","type":"text","required":false},
    {"key":"dominio","label":"Dominio","type":"text","required":false},
    {"key":"ip","label":"Direccion IP","type":"text","required":false},
    {"key":"mac","label":"Direccion MAC","type":"text","required":false},
    {"key":"bios","label":"Version BIOS","type":"text","required":false},
    {"key":"fecha_compra","label":"Fecha de compra","type":"date","required":false},
    {"key":"garantia_hasta","label":"Garantia hasta","type":"date","required":false},
    {"key":"proveedor","label":"Proveedor","type":"text","required":false},
    {"key":"estado_fisico","label":"Estado fisico","type":"select","required":false,"options":["Excelente","Bueno","Regular","Deteriorado","Danado"]},
    {"key":"observaciones","label":"Observaciones","type":"text","required":false}
  ]'::jsonb
  WHERE module_id = mod_inv AND name = 'Equipos de Cómputo' AND deleted_at IS NULL;

  UPDATE modules.categories
  SET field_schema = '[
    {"key":"marca","label":"Marca","type":"text","required":true},
    {"key":"modelo","label":"Modelo","type":"text","required":true},
    {"key":"tipo_periferico","label":"Tipo de periférico","type":"select","required":true,
     "options":["Teclado","Mouse","Monitor","Impresora","Escáner","Webcam","Auriculares","Micrófono","Altavoces","Hub USB","Docking Station","UPS","Proyector","Otro"]},
    {"key":"conexion","label":"Tecnología de conexión","type":"select","required":false,
     "options":["USB","USB-C","Bluetooth","Inalámbrico 2.4GHz","HDMI","DisplayPort","VGA","PS/2","RJ-45","Interno"]},
    {"key":"estado_fisico","label":"Estado físico","type":"select","required":false,"options":["Excelente","Bueno","Regular","Deteriorado","Dañado"]},
    {"key":"fecha_compra","label":"Fecha de compra","type":"date","required":false},
    {"key":"garantia_hasta","label":"Garantia hasta","type":"date","required":false},
    {"key":"proveedor","label":"Proveedor","type":"text","required":false},
    {"key":"compatible_con","label":"Compatible con equipo","type":"text","required":false},
    {"key":"observaciones","label":"Observaciones","type":"text","required":false}
  ]'::jsonb
  WHERE module_id = mod_inv AND name = 'Periféricos' AND deleted_at IS NULL;

  UPDATE modules.categories
  SET field_schema = '[
    {"key":"tipo_mueble","label":"Tipo de mueble","type":"select","required":true,
     "options":["Escritorio","Silla","Silla ergonómica","Mesa de reuniones","Archivador","Estante","Locker","Sofá","Otro"]},
    {"key":"material","label":"Material","type":"select","required":false,"options":["Madera","Metálico","Plástico","Vidrio","Mixto"]},
    {"key":"color","label":"Color","type":"text","required":false},
    {"key":"dimensiones","label":"Dimensiones (LxAxH cm)","type":"text","required":false},
    {"key":"estado_fisico","label":"Estado físico","type":"select","required":false,"options":["Excelente","Bueno","Regular","Deteriorado","Dañado"]},
    {"key":"fecha_compra","label":"Fecha de compra","type":"date","required":false},
    {"key":"proveedor","label":"Proveedor","type":"text","required":false},
    {"key":"observaciones","label":"Observaciones","type":"text","required":false}
  ]'::jsonb
  WHERE module_id = mod_inv AND name = 'Mobiliario' AND deleted_at IS NULL;

  UPDATE modules.categories
  SET field_schema = '[
    {"key":"software","label":"Software / Producto","type":"text","required":true},
    {"key":"fabricante","label":"Fabricante","type":"text","required":false},
    {"key":"tipo_licencia","label":"Tipo de licencia","type":"select","required":false,
     "options":["Perpetua","Suscripción anual","Suscripción mensual","OEM","Volumen","Trial","Open Source"]},
    {"key":"clave","label":"Clave / Número de serie","type":"text","required":false},
    {"key":"asientos","label":"Asientos / Usuarios","type":"number","required":false},
    {"key":"fecha_compra","label":"Fecha de compra","type":"date","required":false},
    {"key":"vence","label":"Fecha de vencimiento","type":"date","required":false},
    {"key":"proveedor","label":"Proveedor","type":"text","required":false},
    {"key":"url_portal","label":"Portal / URL licencia","type":"text","required":false},
    {"key":"observaciones","label":"Observaciones","type":"text","required":false}
  ]'::jsonb
  WHERE module_id = mod_inv AND name = 'Licencias' AND deleted_at IS NULL;

  RAISE NOTICE 'Migration 022: field_schema aplicado.';
END;
$$;

-- ── Migration 023: múltiples custodios + acciones de relación ──
ALTER TABLE inventory.asset_assignments
  ADD COLUMN IF NOT EXISTS shift       varchar(20),
  ADD COLUMN IF NOT EXISTS hours_start varchar(10),
  ADD COLUMN IF NOT EXISTS hours_end   varchar(10);

ALTER TABLE inventory.asset_assignment_history
  DROP CONSTRAINT IF EXISTS asset_assignment_history_action_check;

ALTER TABLE inventory.asset_assignment_history
  ADD CONSTRAINT asset_assignment_history_action_check
  CHECK (action IN (
    'asignado', 'devuelto', 'transferido',
    'dado_de_baja', 'reparacion',
    'asociado', 'desasociado'
  ));
