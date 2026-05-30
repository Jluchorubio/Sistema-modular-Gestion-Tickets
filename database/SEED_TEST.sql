-- ============================================================================
-- SEED_TEST.sql — Datos mínimos de arranque (sin usuarios fake)
-- Sistema Modular de Gestión de Tickets
--
-- Aplicar DESPUÉS de SCHEMA_MASTER.sql en DB vacía:
--   psql -d <db> -v ON_ERROR_STOP=1 -f database/SEED_TEST.sql
--
-- Incluye:
--   1. Locations + Environments + Categories por módulo
--   2. SLA Policies con reglas por módulo
--   3. 3 activos de inventario de ejemplo
--
-- NO incluye: usuarios fake, tickets de prueba, solicitudes admin,
--             org.nodes, asignaciones de módulo.
-- El superadmin se crea durante el setup wizard (/setup).
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Locations, Environments y Categories por módulo
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mod_helpdesk   UUID;
  mod_inventario UUID;
  mod_gestion    UUID;
  loc_hd_p  UUID; loc_hd_n UUID; loc_hd_s UUID; loc_hd_c UUID;
  loc_inv_p UUID; loc_inv_n UUID; loc_inv_s UUID; loc_inv_c UUID;
  loc_ges_p UUID; loc_ges_n UUID; loc_ges_s UUID; loc_ges_c UUID;
  env_bod   UUID;
BEGIN
  SELECT id INTO mod_helpdesk   FROM modules.modules WHERE slug = 'helpdesk'               AND deleted_at IS NULL;
  SELECT id INTO mod_inventario FROM modules.modules WHERE slug = 'inventario'             AND deleted_at IS NULL;
  SELECT id INTO mod_gestion    FROM modules.modules WHERE slug = 'gestion-administrativa' AND deleted_at IS NULL;

  IF mod_helpdesk IS NULL OR mod_inventario IS NULL OR mod_gestion IS NULL THEN
    RAISE WARNING 'Módulos built-in no encontrados — ejecuta SCHEMA_MASTER.sql primero';
    RETURN;
  END IF;

  -- ── Helpdesk locations ────────────────────────────────────────────────────
  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Sede Principal',  'Av. El Dorado #68B-85')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_p;
  IF loc_hd_p IS NULL THEN SELECT id INTO loc_hd_p FROM modules.locations WHERE module_id=mod_helpdesk AND name='Sede Principal'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Sede Norte', 'Calle 80 #45-23')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_n;
  IF loc_hd_n IS NULL THEN SELECT id INTO loc_hd_n FROM modules.locations WHERE module_id=mod_helpdesk AND name='Sede Norte'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Sede Sur', 'Carrera 30 #12-67')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_s;
  IF loc_hd_s IS NULL THEN SELECT id INTO loc_hd_s FROM modules.locations WHERE module_id=mod_helpdesk AND name='Sede Sur'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Centro Operativo', 'Cra 7 #32-16')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_c;
  IF loc_hd_c IS NULL THEN SELECT id INTO loc_hd_c FROM modules.locations WHERE module_id=mod_helpdesk AND name='Centro Operativo'; END IF;

  INSERT INTO modules.environments (id, module_id, location_id, name) VALUES
    (gen_random_uuid(), mod_helpdesk, loc_hd_p, 'Oficina Central'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_p, 'Laboratorio TI'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_p, 'Sala de Servidores'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_n, 'Oficina Norte'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_s, 'Oficina Sur'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_c, 'Centro de Control')
  ON CONFLICT DO NOTHING;

  INSERT INTO modules.categories (id, module_id, name) VALUES
    (gen_random_uuid(), mod_helpdesk, 'Hardware'),
    (gen_random_uuid(), mod_helpdesk, 'Software'),
    (gen_random_uuid(), mod_helpdesk, 'Red y Conectividad'),
    (gen_random_uuid(), mod_helpdesk, 'Acceso y Cuentas'),
    (gen_random_uuid(), mod_helpdesk, 'Impresoras y Periféricos')
  ON CONFLICT DO NOTHING;

  -- ── Inventario locations ──────────────────────────────────────────────────
  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_inventario, 'Sede Principal', 'Av. El Dorado #68B-85')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_inv_p;
  IF loc_inv_p IS NULL THEN SELECT id INTO loc_inv_p FROM modules.locations WHERE module_id=mod_inventario AND name='Sede Principal'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_inventario, 'Sede Norte', 'Calle 80 #45-23')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_inv_n;
  IF loc_inv_n IS NULL THEN SELECT id INTO loc_inv_n FROM modules.locations WHERE module_id=mod_inventario AND name='Sede Norte'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_inventario, 'Sede Sur', 'Carrera 30 #12-67')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_inv_s;
  IF loc_inv_s IS NULL THEN SELECT id INTO loc_inv_s FROM modules.locations WHERE module_id=mod_inventario AND name='Sede Sur'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_inventario, 'Centro Operativo', 'Cra 7 #32-16')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_inv_c;
  IF loc_inv_c IS NULL THEN SELECT id INTO loc_inv_c FROM modules.locations WHERE module_id=mod_inventario AND name='Centro Operativo'; END IF;

  INSERT INTO modules.environments (id, module_id, location_id, name) VALUES
    (gen_random_uuid(), mod_inventario, loc_inv_p, 'Bodega Principal'),
    (gen_random_uuid(), mod_inventario, loc_inv_p, 'Almacén Central'),
    (gen_random_uuid(), mod_inventario, loc_inv_n, 'Almacén Norte'),
    (gen_random_uuid(), mod_inventario, loc_inv_s, 'Almacén Sur'),
    (gen_random_uuid(), mod_inventario, loc_inv_c, 'Depósito Operativo')
  ON CONFLICT DO NOTHING;

  INSERT INTO modules.categories (id, module_id, name) VALUES
    (gen_random_uuid(), mod_inventario, 'Equipos de Cómputo'),
    (gen_random_uuid(), mod_inventario, 'Periféricos'),
    (gen_random_uuid(), mod_inventario, 'Mobiliario'),
    (gen_random_uuid(), mod_inventario, 'Consumibles'),
    (gen_random_uuid(), mod_inventario, 'Licencias')
  ON CONFLICT DO NOTHING;

  -- ── Gestión Administrativa locations ──────────────────────────────────────
  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_gestion, 'Sede Principal', 'Av. El Dorado #68B-85')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_ges_p;
  IF loc_ges_p IS NULL THEN SELECT id INTO loc_ges_p FROM modules.locations WHERE module_id=mod_gestion AND name='Sede Principal'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_gestion, 'Sede Norte', 'Calle 80 #45-23')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_ges_n;
  IF loc_ges_n IS NULL THEN SELECT id INTO loc_ges_n FROM modules.locations WHERE module_id=mod_gestion AND name='Sede Norte'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_gestion, 'Sede Sur', 'Carrera 30 #12-67')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_ges_s;
  IF loc_ges_s IS NULL THEN SELECT id INTO loc_ges_s FROM modules.locations WHERE module_id=mod_gestion AND name='Sede Sur'; END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_gestion, 'Centro Operativo', 'Cra 7 #32-16')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_ges_c;
  IF loc_ges_c IS NULL THEN SELECT id INTO loc_ges_c FROM modules.locations WHERE module_id=mod_gestion AND name='Centro Operativo'; END IF;

  INSERT INTO modules.environments (id, module_id, location_id, name) VALUES
    (gen_random_uuid(), mod_gestion, loc_ges_p, 'Recepción'),
    (gen_random_uuid(), mod_gestion, loc_ges_p, 'Área Administrativa'),
    (gen_random_uuid(), mod_gestion, loc_ges_s, 'Sala de Reuniones')
  ON CONFLICT DO NOTHING;

  INSERT INTO modules.categories (id, module_id, name) VALUES
    (gen_random_uuid(), mod_gestion, 'Cambio de Rol'),
    (gen_random_uuid(), mod_gestion, 'Acceso a Módulo'),
    (gen_random_uuid(), mod_gestion, 'Corrección de Datos'),
    (gen_random_uuid(), mod_gestion, 'Cambio de Sede'),
    (gen_random_uuid(), mod_gestion, 'Permisos Especiales')
  ON CONFLICT DO NOTHING;

END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. SLA Policies por módulo
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mod_id  UUID;
  pol_id  UUID;
BEGIN
  FOR mod_id IN
    SELECT id FROM modules.modules
    WHERE slug IN ('helpdesk', 'inventario', 'gestion-administrativa')
      AND deleted_at IS NULL
  LOOP
    IF NOT EXISTS (SELECT 1 FROM tickets.sla_policies WHERE module_id = mod_id AND is_active = true) THEN
      INSERT INTO tickets.sla_policies (id, module_id, name, description, version, is_active)
      VALUES (gen_random_uuid(), mod_id, 'SLA Estándar', 'Política SLA por defecto', 1, true)
      RETURNING id INTO pol_id;

      INSERT INTO tickets.sla_rules (id, policy_id, priority_result, resolution_time_hours, rule_order) VALUES
        (gen_random_uuid(), pol_id, 'critica', 4,  1),
        (gen_random_uuid(), pol_id, 'alta',    8,  2),
        (gen_random_uuid(), pol_id, 'media',   24, 3),
        (gen_random_uuid(), pol_id, 'baja',    72, 4);
    END IF;
  END LOOP;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Activos de inventario (3 ejemplos)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mod_inv  UUID;
  cat_eq   UUID;
  env_bod  UUID;
BEGIN
  SELECT id INTO mod_inv FROM modules.modules WHERE slug = 'inventario' AND deleted_at IS NULL;
  IF mod_inv IS NULL THEN RAISE WARNING 'Módulo inventario no encontrado'; RETURN; END IF;

  SELECT id INTO cat_eq FROM modules.categories WHERE module_id = mod_inv AND name = 'Equipos de Cómputo' AND deleted_at IS NULL LIMIT 1;
  SELECT e.id INTO env_bod FROM modules.environments e
    JOIN modules.locations l ON l.id = e.location_id
    WHERE e.module_id = mod_inv AND l.name = 'Sede Principal' AND e.is_active = true LIMIT 1;

  IF cat_eq IS NULL OR env_bod IS NULL THEN
    RAISE WARNING 'Categoría o ambiente de inventario no encontrado — omitiendo activos';
    RETURN;
  END IF;

  INSERT INTO inventory.assets
    (id, module_id, environment_id, category_id, name, description, serial_number, status, version,
     specifications)
  VALUES
    (gen_random_uuid(), mod_inv, env_bod, cat_eq,
     'Laptop Dell Latitude 5420',
     'Laptop Dell Latitude 5420 — Equipo de cómputo',
     'DELL-5420-001', 'disponible', 1,
     '{"marca":"Dell","modelo":"Latitude 5420","ram":"16GB","storage":"512GB SSD","os":"Windows 11"}'),
    (gen_random_uuid(), mod_inv, env_bod, cat_eq,
     'Laptop HP ProBook 450 G9',
     'Laptop HP ProBook 450 G9 — Equipo de cómputo',
     'HP-450G9-002', 'disponible', 1,
     '{"marca":"HP","modelo":"ProBook 450 G9","ram":"8GB","storage":"256GB SSD","os":"Windows 11"}'),
    (gen_random_uuid(), mod_inv, env_bod, cat_eq,
     'Desktop Lenovo ThinkCentre M720',
     'Desktop Lenovo ThinkCentre M720 — Equipo de cómputo',
     'LEN-TC-003', 'disponible', 1,
     '{"marca":"Lenovo","modelo":"ThinkCentre M720","ram":"16GB","storage":"1TB HDD","os":"Windows 10"}')
  ON CONFLICT DO NOTHING;
END;
$$;

COMMIT;

-- ============================================================================
-- Verificación post-seed
-- ============================================================================
SELECT 'modulos'          AS tabla, count(*) FROM modules.modules   WHERE deleted_at IS NULL
UNION ALL
SELECT 'locations',                  count(*) FROM modules.locations WHERE deleted_at IS NULL
UNION ALL
SELECT 'environments',               count(*) FROM modules.environments WHERE is_active = true
UNION ALL
SELECT 'categories',                 count(*) FROM modules.categories WHERE deleted_at IS NULL
UNION ALL
SELECT 'sla_policies',               count(*) FROM tickets.sla_policies WHERE is_active = true
UNION ALL
SELECT 'module_roles',               count(*) FROM modules.module_roles WHERE is_active = true
UNION ALL
SELECT 'assets',                     count(*) FROM inventory.assets WHERE deleted_at IS NULL
UNION ALL
SELECT 'usuarios (solo superadmin)', count(*) FROM users.profiles WHERE deleted_at IS NULL AND is_superadmin = false AND is_active = true
ORDER BY tabla;
