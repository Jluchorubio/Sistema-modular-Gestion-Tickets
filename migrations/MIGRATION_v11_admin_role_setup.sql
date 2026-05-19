-- ============================================================================
-- MIGRATION_v11_admin_role_setup.sql
-- Garantiza que exista un rol global "admin" con grants completos.
-- Idempotente: ON CONFLICT DO NOTHING en todos los inserts.
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Crear rol "admin" en config.global_roles si no existe
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.global_roles (name, description, is_active)
VALUES ('admin', 'Administrador global del sistema', TRUE)
ON CONFLICT (name) DO UPDATE SET is_active = TRUE, description = EXCLUDED.description;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Grants para el rol "admin" — global + gestion + helpdesk + inventario
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name = 'admin'
  AND  pd.key IN (
        -- global: acceso y sidebar
        'global:system:access',
        'global:sidebar:view',
        'global:sidebar:dashboard',
        'global:sidebar:users',
        'global:sidebar:roles',
        'global:sidebar:reports',
        'global:sidebar:trash',
        -- global: acciones
        'global:dashboard:view',
        'global:dashboard:modules_view',
        'global:users:view',
        'global:users:create',
        'global:users:edit',
        'global:users:delete',
        'global:users:assign_role',
        'global:roles:view',
        'global:roles:create',
        'global:roles:edit',
        'global:roles:delete',
        'global:roles:assign_perms',
        'global:reports:view',
        'global:trash:view',
        'global:trash:restore',
        'global:trash:purge',
        'global:config:view',
        -- gestion admin completo
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
        -- helpdesk
        'helpdesk:tickets:view',
        'helpdesk:tickets:create',
        'helpdesk:tickets:edit',
        'helpdesk:tickets:close',
        'helpdesk:tickets:assign',
        'helpdesk:comments:add',
        -- inventario
        'inventario:items:view',
        'inventario:items:create',
        'inventario:items:edit'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Asignar rol "admin" a todos los usuarios que tengan is_superadmin = FALSE
--    y global_role_id = NULL (usuarios sin rol global asignado)
--    SOLO si hay usuarios huérfanos — no forzar sobre usuarios con rol existente
-- ─────────────────────────────────────────────────────────────────────────────
-- (Comentado por seguridad — descomenta si quieres auto-asignar)
-- UPDATE users.profiles
-- SET    global_role_id = (SELECT id FROM config.global_roles WHERE name = 'admin')
-- WHERE  is_superadmin = FALSE
--   AND  global_role_id IS NULL
--   AND  deleted_at IS NULL;

COMMIT;

-- Verificación
SELECT gr.name, count(rpg.permission_key) AS grants
FROM   config.global_roles gr
LEFT   JOIN config.role_permission_grants rpg ON rpg.role_id = gr.id AND rpg.role_type = 'global'
GROUP  BY gr.name
ORDER  BY gr.name;
