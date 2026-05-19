-- ============================================================================
-- MIGRATION_v10_default_module_grants.sql
-- Siembra grants por defecto para roles globales y de módulo.
-- Aplica sobre MIGRATION_v9_permissions.sql ya aplicado.
--
-- Problema: v9 no sembró grants para module roles ni permisos de módulo
-- para roles globales. Sin esto, usuarios no-superadmin reciben 403 en
-- todos los endpoints con @RequirePermission de scope gestion/helpdesk/inventario.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Rol global ADMIN/ADMIN_GLOBAL → permisos gestion admin + helpdesk + inventario
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name IN ('admin', 'admin_global')
  AND  pd.key IN (
        -- gestion — admin completo
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
        -- helpdesk — vista completa
        'helpdesk:tickets:view',
        'helpdesk:tickets:create',
        'helpdesk:tickets:edit',
        'helpdesk:tickets:close',
        'helpdesk:tickets:assign',
        'helpdesk:comments:add',
        -- inventario — vista completa
        'inventario:items:view',
        'inventario:items:create',
        'inventario:items:edit'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Rol global USUARIO/USER/EMPLEADO → acceso básico a módulos
--    (mismas rutas que antes del RBAC eran abiertas a todo usuario autenticado)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name IN ('user', 'usuario', 'empleado', 'member')
  AND  pd.key IN (
        'gestion:requests:view_own',
        'gestion:requests:create',
        'helpdesk:tickets:view',
        'helpdesk:tickets:create',
        'helpdesk:comments:add',
        'inventario:items:view'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Module roles con is_admin=TRUE → grants de admin para su scope
-- ─────────────────────────────────────────────────────────────────────────────

-- 3a. Gestion admin module roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules m ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = TRUE
  AND  mr.is_active = TRUE
  AND  m.permission_scope = 'gestion'
  AND  pd.key IN (
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
        'gestion:trash:restore'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 3b. Helpdesk admin module roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules m ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = TRUE
  AND  mr.is_active = TRUE
  AND  m.permission_scope = 'helpdesk'
  AND  pd.key IN (
        'helpdesk:tickets:view',
        'helpdesk:tickets:create',
        'helpdesk:tickets:edit',
        'helpdesk:tickets:close',
        'helpdesk:tickets:delete',
        'helpdesk:tickets:assign',
        'helpdesk:comments:add',
        'helpdesk:comments:delete'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 3c. Inventario admin module roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules m ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = TRUE
  AND  mr.is_active = TRUE
  AND  m.permission_scope = 'inventario'
  AND  pd.key IN (
        'inventario:items:view',
        'inventario:items:create',
        'inventario:items:edit',
        'inventario:items:delete'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Module roles con is_admin=FALSE → grants básicos de usuario para su scope
-- ─────────────────────────────────────────────────────────────────────────────

-- 4a. Gestion usuario module roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules m ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = FALSE
  AND  mr.is_active = TRUE
  AND  m.permission_scope = 'gestion'
  AND  pd.key IN (
        'gestion:requests:view_own',
        'gestion:requests:create'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 4b. Helpdesk usuario module roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules m ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = FALSE
  AND  mr.is_active = TRUE
  AND  m.permission_scope = 'helpdesk'
  AND  pd.key IN (
        'helpdesk:tickets:view',
        'helpdesk:tickets:create',
        'helpdesk:comments:add'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- 4c. Inventario usuario module roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
JOIN   modules.modules m ON m.id = mr.module_id
CROSS  JOIN config.permission_definitions pd
WHERE  mr.is_admin = FALSE
  AND  mr.is_active = TRUE
  AND  m.permission_scope = 'inventario'
  AND  pd.key IN (
        'inventario:items:view'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

COMMIT;

-- Verificación
SELECT
  COALESCE(gr.name, 'module:' || mr.name) AS rol,
  rpg.role_type,
  count(rpg.permission_key) AS grants
FROM config.role_permission_grants rpg
LEFT JOIN config.global_roles gr ON gr.id = rpg.role_id AND rpg.role_type = 'global'
LEFT JOIN modules.module_roles mr ON mr.id = rpg.role_id AND rpg.role_type = 'module'
GROUP BY 1, 2
ORDER BY 2, 1;
