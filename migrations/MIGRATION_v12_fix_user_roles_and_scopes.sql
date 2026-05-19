-- ============================================================================
-- MIGRATION_v12_fix_user_roles_and_scopes.sql
-- Problema raíz: usuarios sin global_role_id → getUserPermissions devuelve
-- Set vacío → todos los @RequirePermission endpoints retornan 403.
--
-- Fixes:
--   1. Asegurar que existan los roles globales 'usuario' y 'admin'
--   2. Sembrar grants básicos para 'usuario' (view_own + create por módulo)
--   3. Asignar global_role_id a todos los usuarios que lo tienen NULL
--      → admins de módulo (is_admin=TRUE) → rol 'admin'
--      → resto → rol 'usuario'
--   4. Corregir permission_scope en módulos que quedaron NULL tras v9
--   5. Re-sembrar grants de module roles con scopes corregidos
-- Idempotente: ON CONFLICT DO NOTHING en todos los inserts.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Garantizar que existan los roles globales clave
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.global_roles (name, description, is_active)
VALUES
  ('admin',   'Administrador global del sistema',  TRUE),
  ('usuario', 'Usuario estándar del sistema',       TRUE)
ON CONFLICT (name) DO UPDATE SET is_active = TRUE, description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Grants para rol 'usuario' — acceso básico a todos los módulos
--    (lo que antes era acceso libre para cualquier usuario autenticado)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name = 'usuario'
  AND  pd.key IN (
        -- acceso base al sistema
        'global:system:access',
        'global:sidebar:view',
        'global:sidebar:dashboard',
        'global:dashboard:view',
        'global:dashboard:modules_view',
        -- gestión: crear y ver propias solicitudes
        'gestion:requests:view_own',
        'gestion:requests:create',
        -- helpdesk: ver y crear tickets, comentar
        'helpdesk:tickets:view',
        'helpdesk:tickets:create',
        'helpdesk:comments:add',
        -- inventario: solo lectura
        'inventario:items:view'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Grants para rol 'admin' — control total sobre todos los módulos
--    (mismos que v11 pero idempotente; incluye permisos del sidebar de admin)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name = 'admin'
  AND  pd.key IN (
        -- acceso base
        'global:system:access',
        'global:sidebar:view',
        'global:sidebar:dashboard',
        'global:dashboard:view',
        'global:dashboard:modules_view',
        -- usuarios
        'global:sidebar:users',
        'global:users:view',
        'global:users:create',
        'global:users:edit',
        'global:users:delete',
        'global:users:assign_role',
        -- roles globales
        'global:sidebar:roles',
        'global:roles:view',
        'global:roles:create',
        'global:roles:edit',
        'global:roles:delete',
        'global:roles:assign_perms',
        -- reportes
        'global:sidebar:reports',
        'global:reports:view',
        -- papelera
        'global:sidebar:trash',
        'global:trash:view',
        'global:trash:restore',
        'global:trash:purge',
        -- gestión admin completo
        'gestion:requests:view_own',
        'gestion:requests:view_all',
        'gestion:requests:create',
        'gestion:requests:take',
        'gestion:requests:progress',
        'gestion:requests:approve',
        'gestion:requests:reject',
        'gestion:requests:escalate',
        'gestion:roles:view',
        'gestion:roles:create',
        'gestion:roles:edit',
        'gestion:roles:delete',
        'gestion:users:view',
        'gestion:users:assign_role',
        'gestion:reports:view',
        'gestion:trash:view',
        'gestion:trash:restore',
        -- helpdesk admin
        'helpdesk:tickets:view',
        'helpdesk:tickets:create',
        'helpdesk:tickets:edit',
        'helpdesk:tickets:close',
        'helpdesk:tickets:assign',
        'helpdesk:comments:add',
        -- inventario admin
        'inventario:items:view',
        'inventario:items:create',
        'inventario:items:edit'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Asignar global_role_id a usuarios que lo tienen NULL
--    Paso A: usuarios que son admin_modulo (tienen algún module role con is_admin=TRUE)
--            → rol 'admin'
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE users.profiles p
SET    global_role_id = (SELECT id FROM config.global_roles WHERE name = 'admin')
WHERE  p.is_superadmin  = FALSE
  AND  p.global_role_id IS NULL
  AND  p.deleted_at     IS NULL
  AND  EXISTS (
         SELECT 1
         FROM   modules.user_module_roles umr
         JOIN   modules.module_roles      mr  ON mr.id = umr.role_id
         WHERE  umr.user_id   = p.id
           AND  umr.is_active = TRUE
           AND  mr.is_admin   = TRUE
           AND  mr.is_active  = TRUE
       );

-- Paso B: resto de usuarios sin rol → rol 'usuario'
UPDATE users.profiles p
SET    global_role_id = (SELECT id FROM config.global_roles WHERE name = 'usuario')
WHERE  p.is_superadmin  = FALSE
  AND  p.global_role_id IS NULL
  AND  p.deleted_at     IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Corregir permission_scope en módulos que quedaron NULL después de v9
--    (v9 usaba ILIKEs frágiles; aquí se añaden más patrones)
-- ─────────────────────────────────────────────────────────────────────────────

-- Gestión Administrativa
UPDATE modules.modules
SET    permission_scope = 'gestion'
WHERE  permission_scope IS NULL
  AND  deleted_at       IS NULL
  AND  (
         slug  ILIKE '%gestion%' OR slug  ILIKE '%admin%'
      OR name  ILIKE '%gesti%'   OR name  ILIKE '%admin%'
      OR name  ILIKE '%solicitud%'
       );

-- Helpdesk / Mesa de ayuda
UPDATE modules.modules
SET    permission_scope = 'helpdesk'
WHERE  permission_scope IS NULL
  AND  deleted_at       IS NULL
  AND  (
         slug  ILIKE '%helpdesk%' OR slug  ILIKE '%help%'  OR slug  ILIKE '%soporte%'
      OR name  ILIKE '%helpdesk%' OR name  ILIKE '%help%'  OR name  ILIKE '%soporte%'
      OR name  ILIKE '%mesa%'     OR name  ILIKE '%ticket%' OR name  ILIKE '%ayuda%'
       );

-- Inventario
UPDATE modules.modules
SET    permission_scope = 'inventario'
WHERE  permission_scope IS NULL
  AND  deleted_at       IS NULL
  AND  (
         slug  ILIKE '%inventario%' OR slug  ILIKE '%invent%' OR slug  ILIKE '%stock%'
      OR name  ILIKE '%inventario%' OR name  ILIKE '%invent%' OR name  ILIKE '%stock%'
      OR name  ILIKE '%almac%'      OR name  ILIKE '%bodega%'
       );

-- Fallback: cualquier módulo aún sin scope → asumir 'gestion' (el hub principal)
UPDATE modules.modules
SET    permission_scope = 'gestion'
WHERE  permission_scope IS NULL
  AND  deleted_at       IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Re-sembrar grants de module roles con scopes ahora corregidos
--    (misma lógica que v10, idempotente)
-- ─────────────────────────────────────────────────────────────────────────────

-- 6a. Module roles is_admin=TRUE, scope gestion
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules       m  ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = TRUE AND mr.is_active = TRUE
  AND  m.permission_scope = 'gestion'
  AND  m.deleted_at IS NULL
  AND  pd.key IN (
        'gestion:requests:view_own', 'gestion:requests:view_all',
        'gestion:requests:create',   'gestion:requests:take',
        'gestion:requests:progress', 'gestion:requests:approve',
        'gestion:requests:reject',   'gestion:requests:escalate',
        'gestion:roles:view',        'gestion:roles:create',
        'gestion:roles:edit',        'gestion:roles:delete',
        'gestion:users:view',        'gestion:users:assign_role',
        'gestion:reports:view',      'gestion:trash:view',
        'gestion:trash:restore'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 6b. Module roles is_admin=FALSE, scope gestion
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules       m  ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = FALSE AND mr.is_active = TRUE
  AND  m.permission_scope = 'gestion'
  AND  m.deleted_at IS NULL
  AND  pd.key IN ('gestion:requests:view_own', 'gestion:requests:create')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 6c. Module roles is_admin=TRUE, scope helpdesk
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules       m  ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = TRUE AND mr.is_active = TRUE
  AND  m.permission_scope = 'helpdesk'
  AND  m.deleted_at IS NULL
  AND  pd.key IN (
        'helpdesk:tickets:view',   'helpdesk:tickets:create',
        'helpdesk:tickets:edit',   'helpdesk:tickets:close',
        'helpdesk:tickets:delete', 'helpdesk:tickets:assign',
        'helpdesk:comments:add',   'helpdesk:comments:delete'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 6d. Module roles is_admin=FALSE, scope helpdesk
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules       m  ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = FALSE AND mr.is_active = TRUE
  AND  m.permission_scope = 'helpdesk'
  AND  m.deleted_at IS NULL
  AND  pd.key IN (
        'helpdesk:tickets:view', 'helpdesk:tickets:create', 'helpdesk:comments:add'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 6e. Module roles is_admin=TRUE, scope inventario
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules       m  ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = TRUE AND mr.is_active = TRUE
  AND  m.permission_scope = 'inventario'
  AND  m.deleted_at IS NULL
  AND  pd.key IN (
        'inventario:items:view', 'inventario:items:create',
        'inventario:items:edit', 'inventario:items:delete'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 6f. Module roles is_admin=FALSE, scope inventario
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules       m  ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = FALSE AND mr.is_active = TRUE
  AND  m.permission_scope = 'inventario'
  AND  m.deleted_at IS NULL
  AND  pd.key IN ('inventario:items:view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación post-migración
-- ─────────────────────────────────────────────────────────────────────────────

-- ¿Cuántos usuarios quedaron sin global_role_id? (debe ser 0)
SELECT
  CASE WHEN global_role_id IS NULL THEN 'SIN ROL' ELSE gr.name END AS rol_global,
  count(*) AS usuarios
FROM   users.profiles p
LEFT   JOIN config.global_roles gr ON gr.id = p.global_role_id
WHERE  p.deleted_at IS NULL AND p.is_superadmin = FALSE
GROUP  BY 1 ORDER BY 1;

-- Grants por rol
SELECT
  COALESCE(gr.name, 'module:' || mr.name) AS rol,
  rpg.role_type,
  count(rpg.permission_key) AS grants
FROM   config.role_permission_grants rpg
LEFT   JOIN config.global_roles   gr ON gr.id = rpg.role_id AND rpg.role_type = 'global'
LEFT   JOIN modules.module_roles  mr ON mr.id = rpg.role_id AND rpg.role_type = 'module'
GROUP  BY 1, 2 ORDER BY 2, 1;

-- Módulos con sus scopes
SELECT id, name, slug, permission_scope FROM modules.modules WHERE deleted_at IS NULL ORDER BY name;
