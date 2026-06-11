-- Migration 022: field_schema por defecto para categorías de inventario
-- Aplica los campos dinámicos estándar a las categorías built-in del módulo inventario.
-- Idempotente: solo actualiza si field_schema sigue vacío ([]).

BEGIN;

DO $$
DECLARE
  mod_inv UUID;
BEGIN
  SELECT id INTO mod_inv
  FROM modules.modules
  WHERE slug = 'inventario' AND deleted_at IS NULL;

  IF mod_inv IS NULL THEN
    RAISE WARNING 'Módulo inventario no encontrado — omitiendo migration 022';
    RETURN;
  END IF;

  -- ── Equipos de Cómputo ────────────────────────────────────────────────────
  UPDATE modules.categories
  SET field_schema = '[
    {"key":"marca",          "label":"Marca",                   "type":"text",    "required":true},
    {"key":"modelo",         "label":"Modelo",                  "type":"text",    "required":true},
    {"key":"nombre_equipo",  "label":"Nombre del equipo",       "type":"text",    "required":false},
    {"key":"tipo_equipo",    "label":"Tipo de equipo",          "type":"select",  "required":false,
     "options":["Desktop","Laptop","All-in-One","Servidor","Tablet","Mini PC"]},
    {"key":"sistema_operativo","label":"Sistema Operativo",     "type":"select",  "required":false,
     "options":["Windows 11","Windows 10","Windows Server 2022","Windows Server 2019","Ubuntu","Debian","macOS","Sin OS"]},
    {"key":"version_so",     "label":"Versión SO",              "type":"text",    "required":false},
    {"key":"procesador",     "label":"Procesador",              "type":"text",    "required":false},
    {"key":"generacion_cpu", "label":"Generación procesador",   "type":"text",    "required":false},
    {"key":"ram",            "label":"RAM",                     "type":"select",  "required":false,
     "options":["2GB","4GB","8GB","16GB","32GB","64GB","128GB"]},
    {"key":"tipo_ram",       "label":"Tipo de RAM",             "type":"select",  "required":false,
     "options":["DDR3","DDR4","DDR5","LPDDR4","LPDDR5"]},
    {"key":"almacenamiento", "label":"Almacenamiento",          "type":"text",    "required":false},
    {"key":"tipo_almacenamiento","label":"Tipo almacenamiento", "type":"select",  "required":false,
     "options":["HDD","SSD","NVMe SSD","eMMC","HDD + SSD"]},
    {"key":"tarjeta_grafica","label":"Tarjeta gráfica",         "type":"text",    "required":false},
    {"key":"dominio",        "label":"Dominio",                 "type":"text",    "required":false},
    {"key":"ip",             "label":"Dirección IP",            "type":"text",    "required":false},
    {"key":"mac",            "label":"Dirección MAC",           "type":"text",    "required":false},
    {"key":"bios",           "label":"Versión BIOS",            "type":"text",    "required":false},
    {"key":"fecha_compra",   "label":"Fecha de compra",         "type":"date",    "required":false},
    {"key":"garantia_hasta", "label":"Garantía hasta",          "type":"date",    "required":false},
    {"key":"proveedor",      "label":"Proveedor",               "type":"text",    "required":false},
    {"key":"estado_fisico",  "label":"Estado físico",           "type":"select",  "required":false,
     "options":["Excelente","Bueno","Regular","Deteriorado","Dañado"]},
    {"key":"observaciones",  "label":"Observaciones",           "type":"text",    "required":false}
  ]'::jsonb
  WHERE module_id = mod_inv
    AND name = 'Equipos de Cómputo'
    AND deleted_at IS NULL
    AND field_schema = '[]'::jsonb;

  -- ── Periféricos ───────────────────────────────────────────────────────────
  UPDATE modules.categories
  SET field_schema = '[
    {"key":"marca",          "label":"Marca",                   "type":"text",    "required":true},
    {"key":"modelo",         "label":"Modelo",                  "type":"text",    "required":true},
    {"key":"tipo_periferico","label":"Tipo de periférico",      "type":"select",  "required":true,
     "options":["Teclado","Mouse","Monitor","Impresora","Escáner","Webcam","Auriculares","Micrófono","Altavoces","Hub USB","Docking Station","UPS","Proyector","Otro"]},
    {"key":"conexion",       "label":"Tecnología de conexión",  "type":"select",  "required":false,
     "options":["USB","USB-C","Bluetooth","Inalámbrico 2.4GHz","HDMI","DisplayPort","VGA","PS/2","RJ-45","Interno"]},
    {"key":"estado_fisico",  "label":"Estado físico",           "type":"select",  "required":false,
     "options":["Excelente","Bueno","Regular","Deteriorado","Dañado"]},
    {"key":"fecha_compra",   "label":"Fecha de compra",         "type":"date",    "required":false},
    {"key":"garantia_hasta", "label":"Garantía hasta",          "type":"date",    "required":false},
    {"key":"proveedor",      "label":"Proveedor",               "type":"text",    "required":false},
    {"key":"compatible_con", "label":"Compatible con equipo",   "type":"text",    "required":false},
    {"key":"observaciones",  "label":"Observaciones",           "type":"text",    "required":false}
  ]'::jsonb
  WHERE module_id = mod_inv
    AND name = 'Periféricos'
    AND deleted_at IS NULL
    AND field_schema = '[]'::jsonb;

  -- ── Mobiliario ────────────────────────────────────────────────────────────
  UPDATE modules.categories
  SET field_schema = '[
    {"key":"tipo_mueble",    "label":"Tipo de mueble",          "type":"select",  "required":true,
     "options":["Escritorio","Silla","Silla ergonómica","Mesa de reuniones","Archivador","Estante","Locker","Sofá","Otro"]},
    {"key":"material",       "label":"Material",                "type":"select",  "required":false,
     "options":["Madera","Metálico","Plástico","Vidrio","Mixto"]},
    {"key":"color",          "label":"Color",                   "type":"text",    "required":false},
    {"key":"dimensiones",    "label":"Dimensiones (LxAxH cm)",  "type":"text",    "required":false},
    {"key":"estado_fisico",  "label":"Estado físico",           "type":"select",  "required":false,
     "options":["Excelente","Bueno","Regular","Deteriorado","Dañado"]},
    {"key":"fecha_compra",   "label":"Fecha de compra",         "type":"date",    "required":false},
    {"key":"proveedor",      "label":"Proveedor",               "type":"text",    "required":false},
    {"key":"observaciones",  "label":"Observaciones",           "type":"text",    "required":false}
  ]'::jsonb
  WHERE module_id = mod_inv
    AND name = 'Mobiliario'
    AND deleted_at IS NULL
    AND field_schema = '[]'::jsonb;

  -- ── Licencias ─────────────────────────────────────────────────────────────
  UPDATE modules.categories
  SET field_schema = '[
    {"key":"software",       "label":"Software / Producto",     "type":"text",    "required":true},
    {"key":"fabricante",     "label":"Fabricante",              "type":"text",    "required":false},
    {"key":"tipo_licencia",  "label":"Tipo de licencia",        "type":"select",  "required":false,
     "options":["Perpetua","Suscripción anual","Suscripción mensual","OEM","Volumen","Trial","Open Source"]},
    {"key":"clave",          "label":"Clave / Número de serie", "type":"text",    "required":false},
    {"key":"asientos",       "label":"Asientos / Usuarios",     "type":"number",  "required":false},
    {"key":"fecha_compra",   "label":"Fecha de compra",         "type":"date",    "required":false},
    {"key":"vence",          "label":"Fecha de vencimiento",    "type":"date",    "required":false},
    {"key":"proveedor",      "label":"Proveedor",               "type":"text",    "required":false},
    {"key":"url_portal",     "label":"Portal / URL licencia",   "type":"text",    "required":false},
    {"key":"observaciones",  "label":"Observaciones",           "type":"text",    "required":false}
  ]'::jsonb
  WHERE module_id = mod_inv
    AND name = 'Licencias'
    AND deleted_at IS NULL
    AND field_schema = '[]'::jsonb;

  RAISE NOTICE 'Migration 022: field_schema aplicado a categorías de inventario.';
END;
$$;

COMMIT;
