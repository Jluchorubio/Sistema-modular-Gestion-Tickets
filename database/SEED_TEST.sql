-- ============================================================================
-- SEED_TEST.sql — Datos de prueba / desarrollo
-- Sistema Modular de Gestión de Tickets
--
-- Aplicar DESPUÉS de SCHEMA_MASTER.sql en DB vacía:
--   psql -d <db> -v ON_ERROR_STOP=1 -f database/SEED_TEST.sql
--
-- Contraseña de todos los usuarios: Password123!
-- 10 usuarios fake, 4 sedes, 3 módulos built-in con datos completos
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Org: sedes, departamentos, áreas, cargos
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO org.headquarters (id, name, address, city, country) VALUES
  ('b0000000-0000-0000-0001-000000000001', 'Sede Principal',    'Av. El Dorado #68B-85',  'Bogotá', 'Colombia'),
  ('b0000000-0000-0000-0001-000000000002', 'Sede Norte',        'Calle 80 #45-23',        'Bogotá', 'Colombia'),
  ('b0000000-0000-0000-0001-000000000003', 'Sede Sur',          'Carrera 30 #12-67',      'Bogotá', 'Colombia'),
  ('b0000000-0000-0000-0001-000000000004', 'Centro Operativo',  'Cra 7 #32-16, Centro',   'Bogotá', 'Colombia')
ON CONFLICT DO NOTHING;

INSERT INTO org.departments (id, name, description) VALUES
  ('b0000000-0000-0000-0002-000000000001', 'Sistemas',       'Área de tecnología e infraestructura'),
  ('b0000000-0000-0000-0002-000000000002', 'Soporte',        'Mesa de ayuda y soporte técnico'),
  ('b0000000-0000-0000-0002-000000000003', 'Inventario',     'Gestión de activos y almacén'),
  ('b0000000-0000-0000-0002-000000000004', 'Administrativo', 'Gestión administrativa y RRHH')
ON CONFLICT DO NOTHING;

INSERT INTO org.areas (id, department_id, name) VALUES
  ('b0000000-0000-0000-0003-000000000001', 'b0000000-0000-0000-0002-000000000001', 'Redes'),
  ('b0000000-0000-0000-0003-000000000002', 'b0000000-0000-0000-0002-000000000001', 'Desarrollo'),
  ('b0000000-0000-0000-0003-000000000003', 'b0000000-0000-0000-0002-000000000002', 'Atención al Usuario'),
  ('b0000000-0000-0000-0003-000000000004', 'b0000000-0000-0000-0002-000000000004', 'RRHH')
ON CONFLICT DO NOTHING;

INSERT INTO org.positions (id, name, level, description) VALUES
  ('b0000000-0000-0000-0004-000000000001', 'Técnico TI',      1, 'Técnico operativo de TI'),
  ('b0000000-0000-0000-0004-000000000002', 'Jefe de Área',    2, 'Jefe de área técnica'),
  ('b0000000-0000-0000-0004-000000000003', 'Coordinador',     3, 'Coordinador de departamento'),
  ('b0000000-0000-0000-0004-000000000004', 'Director TI',     4, 'Director de tecnología'),
  ('b0000000-0000-0000-0004-000000000005', 'Asistente Admin', 1, 'Asistente administrativo')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Perfiles de usuario (10 usuarios fake)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO users.profiles
  (id, first_name, last_name, username, display_email, job_title, department,
   primary_sede, profile_complete, is_active, global_role_id,
   headquarters_id, department_id, position_id,
   country, state_province, city)
SELECT
  v.id, v.first_name, v.last_name, v.username, v.email, v.job_title, v.dept,
  v.sede, true, true,
  (SELECT id FROM config.global_roles WHERE name = 'usuario'),
  v.hq_id, v.dept_id, v.pos_id,
  'Colombia', 'Cundinamarca', 'Bogotá'
FROM (VALUES
  ('a1000000-0000-0000-0000-000000000001'::uuid, 'Carlos',    'Mendoza',  'carlos.mendoza',   'carlos.mendoza@empresa.co',
   'Admin Helpdesk',   'Sistemas',        'Sede Principal',   'b0000000-0000-0000-0001-000000000001'::uuid, 'b0000000-0000-0000-0002-000000000001'::uuid, 'b0000000-0000-0000-0004-000000000002'::uuid),
  ('a1000000-0000-0000-0000-000000000002'::uuid, 'Laura',     'Vargas',   'laura.vargas',     'laura.vargas@empresa.co',
   'Admin Inventario', 'Inventario',      'Sede Norte',       'b0000000-0000-0000-0001-000000000002'::uuid, 'b0000000-0000-0000-0002-000000000003'::uuid, 'b0000000-0000-0000-0004-000000000002'::uuid),
  ('a1000000-0000-0000-0000-000000000003'::uuid, 'Miguel',    'Torres',   'miguel.torres',    'miguel.torres@empresa.co',
   'Jefe Técnico TI',  'Sistemas',        'Sede Principal',   'b0000000-0000-0000-0001-000000000001'::uuid, 'b0000000-0000-0000-0002-000000000001'::uuid, 'b0000000-0000-0000-0004-000000000002'::uuid),
  ('a1000000-0000-0000-0000-000000000004'::uuid, 'Valentina', 'Rios',     'valentina.rios',   'valentina.rios@empresa.co',
   'Jefe de Soporte',  'Soporte',         'Sede Sur',         'b0000000-0000-0000-0001-000000000003'::uuid, 'b0000000-0000-0000-0002-000000000002'::uuid, 'b0000000-0000-0000-0004-000000000002'::uuid),
  ('a1000000-0000-0000-0000-000000000005'::uuid, 'Diego',     'Herrera',  'diego.herrera',    'diego.herrera@empresa.co',
   'Técnico TI',       'Sistemas',        'Sede Principal',   'b0000000-0000-0000-0001-000000000001'::uuid, 'b0000000-0000-0000-0002-000000000001'::uuid, 'b0000000-0000-0000-0004-000000000001'::uuid),
  ('a1000000-0000-0000-0000-000000000006'::uuid, 'Juliana',   'Mora',     'juliana.mora',     'juliana.mora@empresa.co',
   'Técnico Soporte',  'Soporte',         'Centro Operativo', 'b0000000-0000-0000-0001-000000000004'::uuid, 'b0000000-0000-0000-0002-000000000002'::uuid, 'b0000000-0000-0000-0004-000000000001'::uuid),
  ('a1000000-0000-0000-0000-000000000007'::uuid, 'Sebastián', 'Castro',   'sebastian.castro', 'sebastian.castro@empresa.co',
   'Técnico Redes',    'Sistemas',        'Sede Norte',       'b0000000-0000-0000-0001-000000000002'::uuid, 'b0000000-0000-0000-0002-000000000001'::uuid, 'b0000000-0000-0000-0004-000000000001'::uuid),
  ('a1000000-0000-0000-0000-000000000008'::uuid, 'Camila',    'Pérez',    'camila.perez',     'camila.perez@empresa.co',
   'Asistente Admin',  'Administrativo',  'Sede Principal',   'b0000000-0000-0000-0001-000000000001'::uuid, 'b0000000-0000-0000-0002-000000000004'::uuid, 'b0000000-0000-0000-0004-000000000005'::uuid),
  ('a1000000-0000-0000-0000-000000000009'::uuid, 'Andrés',    'Gómez',    'andres.gomez',     'andres.gomez@empresa.co',
   'Coordinador',      'Administrativo',  'Sede Sur',         'b0000000-0000-0000-0001-000000000003'::uuid, 'b0000000-0000-0000-0002-000000000004'::uuid, 'b0000000-0000-0000-0004-000000000003'::uuid),
  ('a1000000-0000-0000-0000-000000000010'::uuid, 'Natalia',   'López',    'natalia.lopez',    'natalia.lopez@empresa.co',
   'Analista TI',      'Sistemas',        'Centro Operativo', 'b0000000-0000-0000-0001-000000000004'::uuid, 'b0000000-0000-0000-0002-000000000001'::uuid, 'b0000000-0000-0000-0004-000000000001'::uuid)
) AS v(id, first_name, last_name, username, email, job_title, dept, sede, hq_id, dept_id, pos_id)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Credenciales — contraseña: Password123!
--    Usa pgcrypto bcrypt ($2a$) compatible con node-bcrypt.compare()
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE pw TEXT := crypt('Password123!', gen_salt('bf', 10));
BEGIN
  INSERT INTO auth.credentials (id, user_id, email, password_hash, is_active, failed_login_attempts, force_password_change, otp_enabled)
  VALUES
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000001', 'carlos.mendoza@empresa.co',    pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000002', 'laura.vargas@empresa.co',      pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000003', 'miguel.torres@empresa.co',     pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000004', 'valentina.rios@empresa.co',    pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000005', 'diego.herrera@empresa.co',     pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000006', 'juliana.mora@empresa.co',      pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000007', 'sebastian.castro@empresa.co',  pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000008', 'camila.perez@empresa.co',      pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000009', 'andres.gomez@empresa.co',      pw, true, 0, false, false),
    (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000010', 'natalia.lopez@empresa.co',     pw, true, 0, false, false)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Locations, Environments, Categories — referencia módulos por slug
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mod_helpdesk    UUID;
  mod_inventario  UUID;
  mod_gestion     UUID;
  -- locations
  loc_hd_principal UUID; loc_hd_norte UUID; loc_hd_sur UUID; loc_hd_centro UUID;
  loc_inv_principal UUID; loc_inv_norte UUID;
  loc_gest_principal UUID; loc_gest_sur UUID;
BEGIN
  SELECT id INTO mod_helpdesk   FROM modules.modules WHERE slug = 'helpdesk'               AND deleted_at IS NULL;
  SELECT id INTO mod_inventario FROM modules.modules WHERE slug = 'inventario'             AND deleted_at IS NULL;
  SELECT id INTO mod_gestion    FROM modules.modules WHERE slug = 'gestion-administrativa' AND deleted_at IS NULL;

  IF mod_helpdesk IS NULL OR mod_inventario IS NULL OR mod_gestion IS NULL THEN
    RAISE WARNING 'Uno o más módulos built-in no encontrados — ejecuta SCHEMA_MASTER.sql primero';
    RETURN;
  END IF;

  -- ── Locations Helpdesk ─────────────────────────────────────────────────────
  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Sede Principal',    'Av. El Dorado #68B-85')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_principal;
  IF loc_hd_principal IS NULL THEN
    SELECT id INTO loc_hd_principal FROM modules.locations WHERE module_id=mod_helpdesk AND name='Sede Principal';
  END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Sede Norte', 'Calle 80 #45-23')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_norte;
  IF loc_hd_norte IS NULL THEN
    SELECT id INTO loc_hd_norte FROM modules.locations WHERE module_id=mod_helpdesk AND name='Sede Norte';
  END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Sede Sur', 'Carrera 30 #12-67')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_sur;
  IF loc_hd_sur IS NULL THEN
    SELECT id INTO loc_hd_sur FROM modules.locations WHERE module_id=mod_helpdesk AND name='Sede Sur';
  END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_helpdesk, 'Centro Operativo', 'Cra 7 #32-16')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_hd_centro;
  IF loc_hd_centro IS NULL THEN
    SELECT id INTO loc_hd_centro FROM modules.locations WHERE module_id=mod_helpdesk AND name='Centro Operativo';
  END IF;

  -- ── Environments Helpdesk ──────────────────────────────────────────────────
  INSERT INTO modules.environments (id, module_id, location_id, name) VALUES
    (gen_random_uuid(), mod_helpdesk, loc_hd_principal, 'Oficina Central'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_principal, 'Laboratorio TI'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_principal, 'Sala de Servidores'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_norte,     'Oficina Norte'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_sur,       'Oficina Sur'),
    (gen_random_uuid(), mod_helpdesk, loc_hd_centro,    'Centro de Control')
  ON CONFLICT DO NOTHING;

  -- ── Categories Helpdesk ────────────────────────────────────────────────────
  INSERT INTO modules.categories (id, module_id, name) VALUES
    (gen_random_uuid(), mod_helpdesk, 'Hardware'),
    (gen_random_uuid(), mod_helpdesk, 'Software'),
    (gen_random_uuid(), mod_helpdesk, 'Red y Conectividad'),
    (gen_random_uuid(), mod_helpdesk, 'Acceso y Cuentas'),
    (gen_random_uuid(), mod_helpdesk, 'Impresoras y Periféricos')
  ON CONFLICT DO NOTHING;

  -- ── Locations Inventario ───────────────────────────────────────────────────
  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_inventario, 'Sede Principal', 'Av. El Dorado #68B-85')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_inv_principal;
  IF loc_inv_principal IS NULL THEN
    SELECT id INTO loc_inv_principal FROM modules.locations WHERE module_id=mod_inventario AND name='Sede Principal';
  END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_inventario, 'Sede Norte', 'Calle 80 #45-23')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_inv_norte;
  IF loc_inv_norte IS NULL THEN
    SELECT id INTO loc_inv_norte FROM modules.locations WHERE module_id=mod_inventario AND name='Sede Norte';
  END IF;

  -- ── Environments Inventario ────────────────────────────────────────────────
  INSERT INTO modules.environments (id, module_id, location_id, name) VALUES
    (gen_random_uuid(), mod_inventario, loc_inv_principal, 'Bodega Principal'),
    (gen_random_uuid(), mod_inventario, loc_inv_principal, 'Almacén Central'),
    (gen_random_uuid(), mod_inventario, loc_inv_norte,     'Almacén Norte')
  ON CONFLICT DO NOTHING;

  -- ── Categories Inventario ──────────────────────────────────────────────────
  INSERT INTO modules.categories (id, module_id, name) VALUES
    (gen_random_uuid(), mod_inventario, 'Equipos de Cómputo'),
    (gen_random_uuid(), mod_inventario, 'Periféricos'),
    (gen_random_uuid(), mod_inventario, 'Mobiliario'),
    (gen_random_uuid(), mod_inventario, 'Consumibles'),
    (gen_random_uuid(), mod_inventario, 'Licencias')
  ON CONFLICT DO NOTHING;

  -- ── Locations Gestión Administrativa ──────────────────────────────────────
  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_gestion, 'Sede Principal', 'Av. El Dorado #68B-85')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_gest_principal;
  IF loc_gest_principal IS NULL THEN
    SELECT id INTO loc_gest_principal FROM modules.locations WHERE module_id=mod_gestion AND name='Sede Principal';
  END IF;

  INSERT INTO modules.locations (id, module_id, name, address)
  VALUES (gen_random_uuid(), mod_gestion, 'Sede Sur', 'Carrera 30 #12-67')
  ON CONFLICT DO NOTHING RETURNING id INTO loc_gest_sur;
  IF loc_gest_sur IS NULL THEN
    SELECT id INTO loc_gest_sur FROM modules.locations WHERE module_id=mod_gestion AND name='Sede Sur';
  END IF;

  -- ── Environments Gestión Administrativa ───────────────────────────────────
  INSERT INTO modules.environments (id, module_id, location_id, name) VALUES
    (gen_random_uuid(), mod_gestion, loc_gest_principal, 'Recepción'),
    (gen_random_uuid(), mod_gestion, loc_gest_principal, 'Área Administrativa'),
    (gen_random_uuid(), mod_gestion, loc_gest_sur,       'Sala de Reuniones')
  ON CONFLICT DO NOTHING;

  -- ── Categories Gestión Administrativa ─────────────────────────────────────
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
-- 5. SLA Policies por módulo (requeridas para crear tickets)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mod_id   UUID;
  pol_id   UUID;
BEGIN
  FOR mod_id IN
    SELECT id FROM modules.modules
    WHERE slug IN ('helpdesk', 'inventario', 'gestion-administrativa')
      AND deleted_at IS NULL
  LOOP
    -- Crear policy solo si no existe ya una activa
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
-- 6. Asignaciones de usuarios a roles de módulo
--    Helpdesk: carlos=admin, miguel=jefe_tecnico, diego/sebastian=tecnico, natalia=usuario
--    Inventario: laura=admin, diego=tecnico, camila=usuario
--    Gestión Administrativa: valentina=admin, andres/camila/natalia=usuario
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  sys_id        UUID := '00000000-0000-0000-0000-000000000001';
  mod_helpdesk  UUID;
  mod_inv       UUID;
  mod_gest      UUID;

  PROCEDURE assign_role(p_user UUID, p_module UUID, p_role_name TEXT) AS $$
  DECLARE rid UUID;
  BEGIN
    SELECT id INTO rid FROM modules.module_roles
    WHERE module_id = p_module AND name = p_role_name AND is_active = true;
    IF rid IS NULL THEN RETURN; END IF;
    INSERT INTO modules.user_module_roles (id, user_id, module_id, role_id, assigned_by, is_active)
    VALUES (gen_random_uuid(), p_user, p_module, rid, sys_id, true)
    ON CONFLICT (user_id, module_id, role_id) DO NOTHING;
  END;
BEGIN
  SELECT id INTO mod_helpdesk FROM modules.modules WHERE slug='helpdesk'               AND deleted_at IS NULL;
  SELECT id INTO mod_inv      FROM modules.modules WHERE slug='inventario'             AND deleted_at IS NULL;
  SELECT id INTO mod_gest     FROM modules.modules WHERE slug='gestion-administrativa' AND deleted_at IS NULL;

  IF mod_helpdesk IS NULL OR mod_inv IS NULL OR mod_gest IS NULL THEN
    RAISE WARNING 'Módulos no encontrados — omitiendo asignaciones';
    RETURN;
  END IF;

  -- Helpdesk
  CALL assign_role('a1000000-0000-0000-0000-000000000001', mod_helpdesk, 'admin_modulo');
  CALL assign_role('a1000000-0000-0000-0000-000000000003', mod_helpdesk, 'jefe_tecnico');
  CALL assign_role('a1000000-0000-0000-0000-000000000005', mod_helpdesk, 'tecnico');
  CALL assign_role('a1000000-0000-0000-0000-000000000007', mod_helpdesk, 'tecnico');
  CALL assign_role('a1000000-0000-0000-0000-000000000010', mod_helpdesk, 'usuario');

  -- Inventario
  CALL assign_role('a1000000-0000-0000-0000-000000000002', mod_inv, 'admin_modulo');
  CALL assign_role('a1000000-0000-0000-0000-000000000005', mod_inv, 'tecnico');
  CALL assign_role('a1000000-0000-0000-0000-000000000008', mod_inv, 'usuario');

  -- Gestión Administrativa
  CALL assign_role('a1000000-0000-0000-0000-000000000004', mod_gest, 'admin_modulo');
  CALL assign_role('a1000000-0000-0000-0000-000000000006', mod_gest, 'jefe_tecnico');
  CALL assign_role('a1000000-0000-0000-0000-000000000009', mod_gest, 'usuario');
  CALL assign_role('a1000000-0000-0000-0000-000000000008', mod_gest, 'usuario');
  CALL assign_role('a1000000-0000-0000-0000-000000000010', mod_gest, 'usuario');
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Solicitudes administrativas de muestra (8 registros)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO requests.admin_requests
  (id, requester_id, type, title, description, status, priority, task_source)
VALUES
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000005', 'module_access',
   'Solicitud de acceso a Inventario',
   'Diego Herrera solicita acceso al módulo de inventario para gestionar activos de TI.',
   'pending', 'media', 'user'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000008', 'role_change',
   'Cambio de rol en Helpdesk',
   'Camila Pérez solicita cambio de rol de usuario a técnico en el módulo Helpdesk.',
   'pending', 'media', 'user'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000009', 'account_issue',
   'Problema de acceso al sistema',
   'Andrés Gómez reporta que no puede iniciar sesión desde ayer.',
   'taken', 'alta', 'user'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000010', 'permission_adjustment',
   'Ajuste de permisos en módulo de reportes',
   'Natalia López solicita permiso para visualizar reportes del módulo Helpdesk.',
   'in_progress', 'baja', 'user'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000006', 'technical_issue',
   'Falla en integración de notificaciones',
   'Juliana Mora reporta que las notificaciones por email no se están enviando.',
   'approved', 'alta', 'user'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000007', 'reactivation',
   'Reactivación de cuenta bloqueada',
   'Sebastián Castro solicita reactivación de su cuenta luego de bloqueo por intentos fallidos.',
   'approved', 'alta', 'user'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000005', 'data_correction',
   'Corrección de datos de perfil',
   'Diego Herrera solicita actualización de su sede asignada a Sede Norte.',
   'rejected', 'baja', 'user'),
  (gen_random_uuid(), 'a1000000-0000-0000-0000-000000000008', 'other',
   'Consulta sobre procedimiento interno',
   'Camila Pérez solicita aclaración sobre el procedimiento para solicitar días de teletrabajo.',
   'pending', 'baja', 'user')
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Tickets de muestra (via DO block — requiere env, category, sla_policy, workflow)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  mod_helpdesk UUID;
  wfv_id       UUID;
  st_open      UUID;
  st_process   UUID;
  env_id       UUID;
  cat_id       UUID;
  sla_pol_id   UUID;
BEGIN
  SELECT id INTO mod_helpdesk FROM modules.modules WHERE slug='helpdesk' AND deleted_at IS NULL;
  IF mod_helpdesk IS NULL THEN RETURN; END IF;

  SELECT id INTO wfv_id    FROM tickets.workflow_versions WHERE module_id=mod_helpdesk AND is_active=true ORDER BY version DESC LIMIT 1;
  SELECT id INTO st_open   FROM tickets.states WHERE module_id=mod_helpdesk AND name='abierto'    AND is_active=true LIMIT 1;
  SELECT id INTO st_process FROM tickets.states WHERE module_id=mod_helpdesk AND name='en_proceso' AND is_active=true LIMIT 1;
  SELECT id INTO env_id    FROM modules.environments WHERE module_id=mod_helpdesk AND is_active=true LIMIT 1;
  SELECT id INTO cat_id    FROM modules.categories WHERE module_id=mod_helpdesk AND is_active=true LIMIT 1;
  SELECT id INTO sla_pol_id FROM tickets.sla_policies WHERE module_id=mod_helpdesk AND is_active=true LIMIT 1;

  IF wfv_id IS NULL OR st_open IS NULL OR env_id IS NULL OR cat_id IS NULL OR sla_pol_id IS NULL THEN
    RAISE WARNING 'Helpdesk tickets: faltan dependencias — omitiendo';
    RETURN;
  END IF;

  INSERT INTO tickets.tickets
    (id, module_id, workflow_version_id, current_state_id, environment_id, category_id,
     created_by, priority, urgency, impact, sla_policy_id, title, description,
     version, reprocess_count, created_at)
  VALUES
    (gen_random_uuid(), mod_helpdesk, wfv_id, st_open, env_id, cat_id,
     'a1000000-0000-0000-0000-000000000010', 'alta', 'alta', 'medio', sla_pol_id,
     'Equipo no enciende',
     'El equipo de la estación de trabajo 04 no enciende desde esta mañana.',
     1, 0, now() - INTERVAL '2 days'),
    (gen_random_uuid(), mod_helpdesk, wfv_id, st_open, env_id, cat_id,
     'a1000000-0000-0000-0000-000000000008', 'media', 'media', 'bajo', sla_pol_id,
     'Software de contabilidad no abre',
     'El módulo de facturación del ERP arroja error al iniciar.',
     1, 0, now() - INTERVAL '1 day'),
    (gen_random_uuid(), mod_helpdesk, wfv_id,
     COALESCE(st_process, st_open), env_id, cat_id,
     'a1000000-0000-0000-0000-000000000009', 'alta', 'alta', 'alto', sla_pol_id,
     'Red caída en Sede Norte',
     'La conexión a internet en Sede Norte lleva 3 horas sin funcionar.',
     1, 0, now() - INTERVAL '3 hours'),
    (gen_random_uuid(), mod_helpdesk, wfv_id, st_open, env_id, cat_id,
     'a1000000-0000-0000-0000-000000000007', 'baja', 'baja', 'bajo', sla_pol_id,
     'Impresora sin papel — Sede Principal',
     'La impresora compartida del piso 2 necesita recarga de papel.',
     1, 0, now() - INTERVAL '6 hours')
  ON CONFLICT DO NOTHING;
END;
$$;

COMMIT;

-- ============================================================================
-- Verificación post-seed
-- ============================================================================
SELECT 'usuarios'    AS tabla, count(*) FROM users.profiles   WHERE deleted_at IS NULL AND is_superadmin = false
UNION ALL
SELECT 'credenciales',          count(*) FROM auth.credentials WHERE is_active = true
UNION ALL
SELECT 'modulos',               count(*) FROM modules.modules  WHERE deleted_at IS NULL
UNION ALL
SELECT 'locations',             count(*) FROM modules.locations WHERE deleted_at IS NULL
UNION ALL
SELECT 'environments',          count(*) FROM modules.environments WHERE is_active = true
UNION ALL
SELECT 'categorias',            count(*) FROM modules.categories WHERE deleted_at IS NULL
UNION ALL
SELECT 'sla_policies',          count(*) FROM tickets.sla_policies WHERE is_active = true
UNION ALL
SELECT 'user_module_roles',     count(*) FROM modules.user_module_roles WHERE is_active = true
UNION ALL
SELECT 'admin_requests',        count(*) FROM requests.admin_requests
UNION ALL
SELECT 'tickets',               count(*) FROM tickets.tickets
ORDER BY tabla;
