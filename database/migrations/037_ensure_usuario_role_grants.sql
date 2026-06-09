-- Migration 037: Ensure usuario global role has required base permissions.
-- Idempotent — safe to run multiple times.

INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name = 'usuario'
  AND  pd.key IN (
    'global:system:access',
    'global:sidebar:view',
    'global:sidebar:dashboard',
    'global:dashboard:view',
    'global:dashboard:modules_view',
    'gestion:requests:view_own',
    'gestion:requests:create',
    'helpdesk:tickets:view',
    'helpdesk:tickets:create',
    'helpdesk:comments:add',
    'inventario:items:view'
  )
  AND  pd.is_active = true
ON CONFLICT (role_id, permission_key) DO NOTHING;
