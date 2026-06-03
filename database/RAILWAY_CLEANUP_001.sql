-- ============================================================
-- RAILWAY_CLEANUP_001 — Limpieza post-auditoría
-- Ejecutar en Railway: Data → Query → pegar y ejecutar.
-- IDEMPOTENTE — seguro correr más de una vez.
-- ============================================================

-- ── 1. Eliminar módulos basura (slug vacío o sin sentido) ──
-- Los módulos con nombre/slug sin sentido fueron creados en pruebas.
-- ON CASCADE eliminará: module_roles, user_module_roles, categories,
-- environments, locations, sla_policies, sla_rules, etc. (si FK cascades existen).
-- Si no hay CASCADE en FK, borrar hijo primero.

DO $$
DECLARE
  garbage_slugs TEXT[] := ARRAY['ccvbj','dfghjklñ{','vb','vhbjnk','wergjkkteq'];
  slug TEXT;
  mod_id UUID;
BEGIN
  FOREACH slug IN ARRAY garbage_slugs LOOP
    SELECT id INTO mod_id FROM modules.modules WHERE modules.modules.slug = slug AND deleted_at IS NULL;
    IF mod_id IS NOT NULL THEN
      -- Soft delete del módulo
      UPDATE modules.modules SET deleted_at = now() WHERE id = mod_id;
      -- Limpiar roles del módulo
      DELETE FROM modules.module_roles WHERE module_id = mod_id;
      -- Limpiar asignaciones de usuario al módulo
      DELETE FROM modules.user_module_roles WHERE module_id = mod_id;
      RAISE NOTICE 'Módulo basura eliminado: % (%)', slug, mod_id;
    ELSE
      RAISE NOTICE 'Módulo no encontrado (ya eliminado o inexistente): %', slug;
    END IF;
  END LOOP;
END;
$$;

-- ── 2. Eliminar módulo fantasma por ID (si existe) ──
-- Módulo sin nombre visible creado en pruebas.
DO $$
DECLARE
  phantom_id UUID := '61e1d3fb-0000-0000-0000-000000000000'; -- reemplazar con ID real si es diferente
BEGIN
  IF EXISTS (SELECT 1 FROM modules.modules WHERE id = phantom_id) THEN
    UPDATE modules.modules SET deleted_at = now() WHERE id = phantom_id;
    DELETE FROM modules.module_roles WHERE module_id = phantom_id;
    DELETE FROM modules.user_module_roles WHERE module_id = phantom_id;
    RAISE NOTICE 'Módulo fantasma eliminado: %', phantom_id;
  ELSE
    RAISE NOTICE 'Módulo fantasma no encontrado: %', phantom_id;
  END IF;
END;
$$;

-- ── 3. Limpiar ticket_assignments huérfanos ──
-- Assignments cuyo ticket_id o user_id no existen.
DELETE FROM tickets.ticket_assignments ta
WHERE NOT EXISTS (
  SELECT 1 FROM tickets.tickets t WHERE t.id = ta.ticket_id
)
OR NOT EXISTS (
  SELECT 1 FROM users.profiles p WHERE p.id = ta.user_id
);

-- ── 4. Limpiar SLA policies/rules de módulos basura ya eliminados ──
DELETE FROM config.sla_rules sr
WHERE NOT EXISTS (
  SELECT 1 FROM config.sla_policies sp
  WHERE sp.id = sr.sla_policy_id
);

DELETE FROM config.sla_policies sp
WHERE NOT EXISTS (
  SELECT 1 FROM modules.modules m
  WHERE m.id = sp.module_id AND m.deleted_at IS NULL
);

-- ── 5. Asignar superadmin a todos los módulos activos (si no tiene rol) ──
-- Solo asigna al superadmin (is_superadmin = true).
DO $$
DECLARE
  sadmin_id UUID;
  mod       RECORD;
  role_id   UUID;
BEGIN
  -- Buscar superadmin
  SELECT p.id INTO sadmin_id
  FROM users.profiles p
  WHERE p.is_superadmin = true AND p.deleted_at IS NULL
  LIMIT 1;

  IF sadmin_id IS NULL THEN
    RAISE WARNING 'No se encontró superadmin — omitiendo asignación de módulos';
    RETURN;
  END IF;

  FOR mod IN
    SELECT m.id AS module_id
    FROM modules.modules m
    WHERE m.deleted_at IS NULL AND m.is_active = true
  LOOP
    -- Obtener primer rol de admin del módulo
    SELECT id INTO role_id
    FROM modules.module_roles
    WHERE module_id = mod.module_id
    ORDER BY created_at ASC
    LIMIT 1;

    IF role_id IS NOT NULL THEN
      INSERT INTO modules.user_module_roles (user_id, module_id, module_role_id, status)
      VALUES (sadmin_id, mod.module_id, role_id, 'active')
      ON CONFLICT (user_id, module_id, module_role_id) DO NOTHING;
    END IF;
  END LOOP;

  RAISE NOTICE 'Superadmin (%) asignado a módulos activos', sadmin_id;
END;
$$;

-- ── 6. Verificar SLA en Gestión Administrativa ──
-- Si el módulo no tiene política SLA, copiar estructura de Helpdesk.
DO $$
DECLARE
  mod_ga   UUID;
  mod_hd   UUID;
  hd_pol   RECORD;
  new_pol  UUID;
  hd_rule  RECORD;
BEGIN
  SELECT id INTO mod_ga FROM modules.modules WHERE slug IN ('gestion-administrativa','gestion_administrativa','admin') AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO mod_hd FROM modules.modules WHERE slug IN ('helpdesk','help-desk') AND deleted_at IS NULL LIMIT 1;

  IF mod_ga IS NULL THEN
    RAISE WARNING 'Módulo Gestión Administrativa no encontrado';
    RETURN;
  END IF;

  -- Si ya tiene política, no hacer nada
  IF EXISTS (SELECT 1 FROM config.sla_policies WHERE module_id = mod_ga AND is_active = true) THEN
    RAISE NOTICE 'Gestión Administrativa ya tiene SLA policy — omitiendo';
    RETURN;
  END IF;

  IF mod_hd IS NULL THEN
    RAISE WARNING 'Módulo Helpdesk no encontrado — no se puede copiar SLA';
    RETURN;
  END IF;

  -- Copiar política de Helpdesk
  SELECT * INTO hd_pol FROM config.sla_policies WHERE module_id = mod_hd AND is_active = true LIMIT 1;
  IF hd_pol IS NULL THEN
    RAISE WARNING 'Helpdesk no tiene SLA policy activa';
    RETURN;
  END IF;

  INSERT INTO config.sla_policies (module_id, name, description, is_active, is_default)
  VALUES (mod_ga, 'SLA Gestión Administrativa', 'Política de SLA estándar', true, true)
  RETURNING id INTO new_pol;

  -- Copiar reglas de Helpdesk
  FOR hd_rule IN SELECT * FROM config.sla_rules WHERE sla_policy_id = hd_pol.id LOOP
    INSERT INTO config.sla_rules (
      sla_policy_id, priority, hours_to_first_response, hours_to_resolve,
      applies_to_category_id, applies_to_damage_type_id
    ) VALUES (
      new_pol, hd_rule.priority, hd_rule.hours_to_first_response, hd_rule.hours_to_resolve,
      NULL, NULL
    );
  END LOOP;

  RAISE NOTICE 'SLA policy creada para Gestión Administrativa: %', new_pol;
END;
$$;

-- ── Resumen final ──
SELECT
  (SELECT COUNT(*) FROM modules.modules WHERE deleted_at IS NULL AND is_active = true) AS modulos_activos,
  (SELECT COUNT(*) FROM modules.user_module_roles) AS user_module_roles,
  (SELECT COUNT(*) FROM tickets.ticket_assignments ta
   WHERE NOT EXISTS (SELECT 1 FROM tickets.tickets t WHERE t.id = ta.ticket_id)) AS assignments_huerfanos,
  (SELECT COUNT(*) FROM config.sla_policies WHERE is_active = true) AS sla_policies_activas;
