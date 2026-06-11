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
WHERE module_id = (SELECT id FROM modules.modules WHERE slug = 'inventario' AND deleted_at IS NULL)
  AND name = 'Equipos de Cómputo'
  AND deleted_at IS NULL;
