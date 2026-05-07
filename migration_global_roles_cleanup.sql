-- ============================================================================
-- MIGRACIÓN: Limpieza de roles globales
-- Ejecutar UNA vez contra la DB live
-- ============================================================================

BEGIN;

-- 1. Insertar los 2 roles globales correctos (idempotente)
INSERT INTO config.global_roles (name, description) VALUES
    ('superadmin', 'Administrador global de la plataforma'),
    ('usuario',    'Usuario estándar del sistema')
ON CONFLICT (name) DO NOTHING;

-- 2. Reasignar usuarios que tenían 'admin' global → 'superadmin'
UPDATE users.profiles
SET global_role_id = (SELECT id FROM config.global_roles WHERE name = 'superadmin')
WHERE global_role_id IN (
    SELECT id FROM config.global_roles WHERE name = 'admin'
) AND is_superadmin = true;

-- 3. Reasignar usuarios que tenían tecnico/supervisor/admin sin is_superadmin → 'usuario'
UPDATE users.profiles
SET global_role_id = (SELECT id FROM config.global_roles WHERE name = 'usuario')
WHERE global_role_id IN (
    SELECT id FROM config.global_roles WHERE name IN ('admin', 'tecnico', 'supervisor')
) AND is_superadmin = false;

-- 4. Eliminar roles legacy
DELETE FROM config.global_roles WHERE name IN ('admin', 'tecnico', 'supervisor');

-- 5. Asegurar que todos los superadmin tengan el rol visual correcto
UPDATE users.profiles
SET global_role_id = (SELECT id FROM config.global_roles WHERE name = 'superadmin')
WHERE is_superadmin = true AND (global_role_id IS NULL OR global_role_id NOT IN (
    SELECT id FROM config.global_roles WHERE name = 'superadmin'
));

-- 6. Asegurar que usuarios normales sin rol tengan 'usuario'
UPDATE users.profiles
SET global_role_id = (SELECT id FROM config.global_roles WHERE name = 'usuario')
WHERE is_superadmin = false AND global_role_id IS NULL AND deleted_at IS NULL;

COMMIT;

-- Verificar resultado:
-- SELECT name, description, is_active FROM config.global_roles ORDER BY name;
