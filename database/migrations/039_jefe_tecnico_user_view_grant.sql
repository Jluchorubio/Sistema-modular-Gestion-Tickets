-- Migration 039: Grant global:users:view to jefe_tecnico module role.
-- Required so jefe_tecnico can view user profiles in /requests/users/[id]/profile.
-- Idempotent — safe to run multiple times.

INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM   modules.module_roles mr
CROSS  JOIN config.permission_definitions pd
WHERE  mr.name = 'jefe_tecnico'
  AND  mr.is_active = true
  AND  pd.key IN ('global:users:view')
  AND  pd.is_active = true
ON CONFLICT (role_id, permission_key) DO NOTHING;
