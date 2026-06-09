-- Migration 038: Grant permissions to Gestión Administrativa module roles
-- Roles admin_modulo/tecnico/jefe_tecnico in gestion had zero grants → RBAC completely non-functional

DO $$
DECLARE
  v_admin_id  uuid;
  v_tech_id   uuid;
  v_jefe_id   uuid;
BEGIN
  -- Get role IDs from gestión administrative module
  SELECT mr.id INTO v_admin_id
  FROM modules.module_roles mr
  JOIN modules.modules m ON m.id = mr.module_id
  WHERE m.permission_scope = 'gestion' AND mr.name = 'admin_modulo' AND m.deleted_at IS NULL
  LIMIT 1;

  SELECT mr.id INTO v_tech_id
  FROM modules.module_roles mr
  JOIN modules.modules m ON m.id = mr.module_id
  WHERE m.permission_scope = 'gestion' AND mr.name = 'tecnico' AND m.deleted_at IS NULL
  LIMIT 1;

  SELECT mr.id INTO v_jefe_id
  FROM modules.module_roles mr
  JOIN modules.modules m ON m.id = mr.module_id
  WHERE m.permission_scope = 'gestion' AND mr.name = 'jefe_tecnico' AND m.deleted_at IS NULL
  LIMIT 1;

  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'admin_modulo role not found for gestion module';
  END IF;

  -- ── admin_modulo: all 17 gestion permissions ────────────────────────────────
  INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
  SELECT v_admin_id, 'module', pd.key
  FROM config.permission_definitions pd
  WHERE pd.scope = 'gestion'
  ON CONFLICT DO NOTHING;

  -- ── jefe_tecnico (= jefe_area): view_all + take + progress + approve + reject + escalate + reports ──
  IF v_jefe_id IS NOT NULL THEN
    INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
    VALUES
      (v_jefe_id, 'module', 'gestion:requests:view_own'),
      (v_jefe_id, 'module', 'gestion:requests:view_all'),
      (v_jefe_id, 'module', 'gestion:requests:create'),
      (v_jefe_id, 'module', 'gestion:requests:take'),
      (v_jefe_id, 'module', 'gestion:requests:progress'),
      (v_jefe_id, 'module', 'gestion:requests:approve'),
      (v_jefe_id, 'module', 'gestion:requests:reject'),
      (v_jefe_id, 'module', 'gestion:requests:escalate'),
      (v_jefe_id, 'module', 'gestion:reports:view'),
      (v_jefe_id, 'module', 'gestion:users:view')
    ON CONFLICT DO NOTHING;
  END IF;

  -- ── tecnico (= gestor): take + progress + approve + reject + view_all ──────
  IF v_tech_id IS NOT NULL THEN
    INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
    VALUES
      (v_tech_id, 'module', 'gestion:requests:view_own'),
      (v_tech_id, 'module', 'gestion:requests:view_all'),
      (v_tech_id, 'module', 'gestion:requests:create'),
      (v_tech_id, 'module', 'gestion:requests:take'),
      (v_tech_id, 'module', 'gestion:requests:progress'),
      (v_tech_id, 'module', 'gestion:requests:approve'),
      (v_tech_id, 'module', 'gestion:requests:reject'),
      (v_tech_id, 'module', 'gestion:reports:view')
    ON CONFLICT DO NOTHING;
  END IF;

  RAISE NOTICE 'Migration 038 complete — gestion role grants seeded';
END $$;
