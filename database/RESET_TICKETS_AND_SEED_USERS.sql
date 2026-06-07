-- ============================================================================
-- RESET_TICKETS_AND_SEED_USERS.sql
-- 1. Borra TODOS los tickets y datos asociados
-- 2. Borra todos los usuarios excepto superadmin
-- 3. Crea 13 usuarios de prueba (1 por rol por módulo + 1 multi-rol)
--
-- Contraseña de todos los usuarios: Test2025!
-- Ejecutar en Railway: Dashboard → DB → Query
-- ============================================================================

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 1: LIMPIAR TICKETS
-- ═══════════════════════════════════════════════════════════════════════════

-- Hijos de tickets (FK order: hijos primero)
DELETE FROM tickets.ticket_ratings;
DELETE FROM tickets.ticket_approvals;
DELETE FROM tickets.ticket_relations;
DELETE FROM inventory.ticket_assets;
DELETE FROM tickets.ticket_sla_tracking;
DELETE FROM tickets.ticket_assignments;

-- Particionadas: DELETE en padre cascadea a particiones
DELETE FROM tickets.ticket_state_history;
DELETE FROM tickets.ticket_comments;
DELETE FROM tickets.ticket_attachments;

-- Padre
DELETE FROM tickets.tickets;

-- Notificaciones (todas, no solo tickets)
DELETE FROM notifications.notification_logs;

-- Audit log de eventos de ticket
DELETE FROM audit.event_log
WHERE entity_type IN ('ticket','ticket_comment','ticket_assignment','ticket_approval');

DO $$ BEGIN RAISE NOTICE '✓ Tickets y datos asociados eliminados'; END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 2: BORRAR USUARIOS NO-SUPERADMIN
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_ids UUID[];
  v_cnt INT;
BEGIN
  SELECT array_agg(id) INTO v_ids
  FROM users.profiles
  WHERE is_superadmin = false
    AND id != '00000000-0000-0000-0000-000000000001';  -- perfil sistema

  IF v_ids IS NULL THEN
    RAISE NOTICE 'No hay usuarios no-superadmin para borrar';
    RETURN;
  END IF;

  v_cnt := array_length(v_ids, 1);

  -- Auth tables
  DELETE FROM auth.mfa_settings      WHERE user_id = ANY(v_ids);
  DELETE FROM auth.email_otp         WHERE user_id = ANY(v_ids);
  DELETE FROM auth.refresh_tokens    WHERE user_id = ANY(v_ids);
  DELETE FROM auth.sessions          WHERE user_id = ANY(v_ids);
  DELETE FROM auth.password_resets   WHERE user_id = ANY(v_ids);
  DELETE FROM auth.credentials       WHERE user_id = ANY(v_ids);

  -- Module assignments
  DELETE FROM modules.user_module_roles WHERE user_id = ANY(v_ids);

  -- Preferences
  DELETE FROM users.preferences WHERE user_id = ANY(v_ids);

  -- Calendar events created by these users
  DELETE FROM calendar.events WHERE created_by = ANY(v_ids);

  -- Profiles
  DELETE FROM users.profiles WHERE id = ANY(v_ids);

  RAISE NOTICE '✓ Borrados % usuarios no-superadmin', v_cnt;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- PARTE 3: CREAR 13 USUARIOS DE PRUEBA
-- Contraseña: Test2025! (bcrypt via pgcrypto)
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  -- Módulos
  mod_hd   UUID;
  mod_inv  UUID;
  mod_ges  UUID;

  -- Roles por módulo
  r_hd_usr   UUID;  r_hd_tec  UUID;  r_hd_jefe  UUID;  r_hd_adm  UUID;
  r_inv_usr  UUID;  r_inv_tec UUID;  r_inv_jefe UUID;  r_inv_adm UUID;
  r_ges_usr  UUID;  r_ges_tec UUID;  r_ges_jefe UUID;  r_ges_adm UUID;

  -- Global role
  g_usr UUID;

  -- Superadmin (para assigned_by)
  v_sa  UUID;

  -- Shared password hash
  v_pw  TEXT;

  -- Current user ID
  uid   UUID;
BEGIN
  -- Password hash (bcrypt 10 rounds)
  v_pw := crypt('Test2025!', gen_salt('bf', 10));

  -- Módulos
  SELECT id INTO mod_hd  FROM modules.modules WHERE slug = 'helpdesk'               AND deleted_at IS NULL;
  SELECT id INTO mod_inv FROM modules.modules WHERE slug = 'inventario'             AND deleted_at IS NULL;
  SELECT id INTO mod_ges FROM modules.modules WHERE slug = 'gestion-administrativa' AND deleted_at IS NULL;

  IF mod_hd IS NULL  THEN RAISE EXCEPTION 'Módulo helpdesk no encontrado';               END IF;
  IF mod_inv IS NULL THEN RAISE EXCEPTION 'Módulo inventario no encontrado';             END IF;
  IF mod_ges IS NULL THEN RAISE EXCEPTION 'Módulo gestion-administrativa no encontrado'; END IF;

  -- Roles helpdesk
  SELECT id INTO r_hd_usr  FROM modules.module_roles WHERE module_id = mod_hd AND name = 'usuario';
  SELECT id INTO r_hd_tec  FROM modules.module_roles WHERE module_id = mod_hd AND name = 'tecnico';
  SELECT id INTO r_hd_jefe FROM modules.module_roles WHERE module_id = mod_hd AND name = 'jefe_tecnico';
  SELECT id INTO r_hd_adm  FROM modules.module_roles WHERE module_id = mod_hd AND name = 'admin_modulo';

  -- Roles inventario
  SELECT id INTO r_inv_usr  FROM modules.module_roles WHERE module_id = mod_inv AND name = 'usuario';
  SELECT id INTO r_inv_tec  FROM modules.module_roles WHERE module_id = mod_inv AND name = 'tecnico';
  SELECT id INTO r_inv_jefe FROM modules.module_roles WHERE module_id = mod_inv AND name = 'jefe_tecnico';
  SELECT id INTO r_inv_adm  FROM modules.module_roles WHERE module_id = mod_inv AND name = 'admin_modulo';

  -- Roles gestión
  SELECT id INTO r_ges_usr  FROM modules.module_roles WHERE module_id = mod_ges AND name = 'usuario';
  SELECT id INTO r_ges_tec  FROM modules.module_roles WHERE module_id = mod_ges AND name = 'tecnico';
  SELECT id INTO r_ges_jefe FROM modules.module_roles WHERE module_id = mod_ges AND name = 'jefe_tecnico';
  SELECT id INTO r_ges_adm  FROM modules.module_roles WHERE module_id = mod_ges AND name = 'admin_modulo';

  -- Global role usuario
  SELECT id INTO g_usr FROM config.global_roles WHERE name = 'usuario';

  -- Superadmin real (para assigned_by)
  SELECT id INTO v_sa FROM users.profiles
  WHERE is_superadmin = true AND id != '00000000-0000-0000-0000-000000000001'
  LIMIT 1;
  IF v_sa IS NULL THEN RAISE EXCEPTION 'Superadmin no encontrado — ejecuta el wizard primero'; END IF;

  -- ─────────────────────────────────────────────────────────────────────────
  -- HELPDESK (4 usuarios)
  -- ─────────────────────────────────────────────────────────────────────────

  -- 1. Carlos Rodríguez — usuario en Helpdesk
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Carlos', 'Rodríguez', 'carlos.usuario', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'carlos.usuario@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_hd, r_hd_usr, v_sa, true);

  -- 2. Ana Martínez — técnico en Helpdesk
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Ana', 'Martínez', 'ana.tecnica', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'ana.tecnica@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_hd, r_hd_tec, v_sa, true);

  -- 3. Luis Herrera — jefe_tecnico en Helpdesk
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Luis', 'Herrera', 'luis.jefe', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'luis.jefe@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_hd, r_hd_jefe, v_sa, true);

  -- 4. María García — admin_modulo en Helpdesk
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'María', 'García', 'maria.admin.hd', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'maria.admin.hd@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_hd, r_hd_adm, v_sa, true);

  -- ─────────────────────────────────────────────────────────────────────────
  -- INVENTARIO (4 usuarios)
  -- ─────────────────────────────────────────────────────────────────────────

  -- 5. Pedro Jiménez — usuario en Inventario
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Pedro', 'Jiménez', 'pedro.inv', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'pedro.inv@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_inv, r_inv_usr, v_sa, true);

  -- 6. Sofía López — técnico en Inventario
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Sofía', 'López', 'sofia.inv', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'sofia.inv@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_inv, r_inv_tec, v_sa, true);

  -- 7. Roberto Díaz — jefe_tecnico en Inventario
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Roberto', 'Díaz', 'roberto.inv', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'roberto.inv@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_inv, r_inv_jefe, v_sa, true);

  -- 8. Carmen Vega — admin_modulo en Inventario
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Carmen', 'Vega', 'carmen.inv', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'carmen.inv@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_inv, r_inv_adm, v_sa, true);

  -- ─────────────────────────────────────────────────────────────────────────
  -- GESTIÓN ADMINISTRATIVA (4 usuarios)
  -- ─────────────────────────────────────────────────────────────────────────

  -- 9. Jorge Morales — usuario en Gestión
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Jorge', 'Morales', 'jorge.ges', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'jorge.ges@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_ges, r_ges_usr, v_sa, true);

  -- 10. Isabella Torres — técnico en Gestión
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Isabella', 'Torres', 'isabella.ges', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'isabella.ges@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_ges, r_ges_tec, v_sa, true);

  -- 11. David Ruiz — jefe_tecnico en Gestión
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'David', 'Ruiz', 'david.ges', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'david.ges@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_ges, r_ges_jefe, v_sa, true);

  -- 12. Laura Ramos — admin_modulo en Gestión
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Laura', 'Ramos', 'laura.ges', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'laura.ges@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active)
  VALUES (uid, mod_ges, r_ges_adm, v_sa, true);

  -- ─────────────────────────────────────────────────────────────────────────
  -- MULTI-ROL (1 usuario con rol en los 3 módulos)
  -- ─────────────────────────────────────────────────────────────────────────

  -- 13. Miguel Castro — técnico HD + técnico INV + jefe_tecnico GES
  uid := gen_random_uuid();
  INSERT INTO users.profiles (id, first_name, last_name, username, is_superadmin, is_active, profile_complete, global_role_id)
  VALUES (uid, 'Miguel', 'Castro', 'miguel.multi', false, true, true, g_usr);
  INSERT INTO auth.credentials (user_id, email, password_hash, is_active)
  VALUES (uid, 'miguel.multi@empresa.com', v_pw, true);
  INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by, is_active) VALUES
    (uid, mod_hd,  r_hd_tec,   v_sa, true),
    (uid, mod_inv, r_inv_tec,  v_sa, true),
    (uid, mod_ges, r_ges_jefe, v_sa, true);

  RAISE NOTICE '✓ 13 usuarios de prueba creados (contraseña: Test2025!)';
END;
$$;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICACIÓN
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  p.first_name || ' ' || p.last_name                        AS nombre,
  c.email,
  COALESCE(
    STRING_AGG(m.slug || ' → ' || mr.name, '  |  ' ORDER BY m.slug),
    '(sin módulo)'
  )                                                          AS roles_módulos
FROM users.profiles p
JOIN auth.credentials c ON c.user_id = p.id
LEFT JOIN modules.user_module_roles umr ON umr.user_id = p.id AND umr.is_active = true
LEFT JOIN modules.module_roles mr ON mr.id = umr.role_id
LEFT JOIN modules.modules m ON m.id = umr.module_id AND m.deleted_at IS NULL
WHERE p.is_superadmin = false
  AND p.id != '00000000-0000-0000-0000-000000000001'
  AND p.deleted_at IS NULL
GROUP BY p.first_name, p.last_name, c.email
ORDER BY p.first_name;
