-- ============================================================================
-- MIGRATION_v9_permissions.sql
-- Motor de permisos RBAC centralizado
-- Reemplaza modules.permissions y modules.role_permissions
-- ============================================================================

BEGIN;

SET CONSTRAINTS ALL DEFERRED;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla config.permission_definitions (catálogo del sistema)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config.permission_definitions (
    key         VARCHAR(100)  NOT NULL,
    label       VARCHAR(200)  NOT NULL,
    description TEXT,
    parent_key  VARCHAR(100)  REFERENCES config.permission_definitions(key) DEFERRABLE INITIALLY DEFERRED,
    scope       VARCHAR(50)   NOT NULL,
    section     VARCHAR(50)   NOT NULL,
    action      VARCHAR(50)   NOT NULL,
    sort_order  INTEGER       NOT NULL DEFAULT 0,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT now(),
    CONSTRAINT pk_permission_definitions PRIMARY KEY (key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Tabla config.role_permission_grants (asignaciones editables)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config.role_permission_grants (
    id             UUID        NOT NULL DEFAULT gen_random_uuid(),
    role_id        UUID        NOT NULL,
    role_type      VARCHAR(20) NOT NULL CHECK (role_type IN ('global', 'module')),
    permission_key VARCHAR(100) NOT NULL REFERENCES config.permission_definitions(key),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_role_permission_grants PRIMARY KEY (id),
    CONSTRAINT uq_role_permission        UNIQUE (role_id, permission_key)
);

CREATE INDEX IF NOT EXISTS idx_rpg_role_type ON config.role_permission_grants(role_id, role_type);
CREATE INDEX IF NOT EXISTS idx_rpg_key        ON config.role_permission_grants(permission_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Agregar permission_scope a módulos
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE modules.modules ADD COLUMN IF NOT EXISTS permission_scope VARCHAR(50);

UPDATE modules.modules SET permission_scope = 'gestion'
WHERE permission_scope IS NULL AND (slug ILIKE '%gestion%' OR name ILIKE '%gesti%');

UPDATE modules.modules SET permission_scope = 'helpdesk'
WHERE permission_scope IS NULL AND (slug ILIKE '%helpdesk%' OR name ILIKE '%help%' OR name ILIKE '%mesa%' OR name ILIKE '%ayuda%');

UPDATE modules.modules SET permission_scope = 'inventario'
WHERE permission_scope IS NULL AND (slug ILIKE '%inventario%' OR name ILIKE '%inventario%');

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Seeds — permission_definitions
--    Orden: padres primero (DEFERRABLE resuelve la FK circular igualmente)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Global: raíz ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('global:system:access',        'Acceso al sistema',                   'Permiso base para entrar al sistema',               'global', 'system',    'access',        NULL,                       0)
ON CONFLICT (key) DO NOTHING;

-- ── Global: sidebar ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('global:sidebar:view',         'Ver barra de navegación',             'Puede ver el menú lateral',                         'global', 'sidebar',   'view',          'global:system:access',     10)
ON CONFLICT (key) DO NOTHING;

-- ── Global: secciones del sidebar ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('global:sidebar:dashboard',    'Ver sección Dashboard',               'Dashboard visible en sidebar',                      'global', 'dashboard', 'sidebar',       'global:sidebar:view',      20),
('global:sidebar:users',        'Ver sección Usuarios',                'Usuarios visible en sidebar',                       'global', 'users',     'sidebar',       'global:sidebar:view',      30),
('global:sidebar:roles',        'Ver sección Roles',                   'Roles visible en sidebar',                          'global', 'roles',     'sidebar',       'global:sidebar:view',      40),
('global:sidebar:reports',      'Ver sección Reportes',                'Reportes visible en sidebar',                       'global', 'reports',   'sidebar',       'global:sidebar:view',      50),
('global:sidebar:trash',        'Ver sección Papelera',                'Papelera visible en sidebar',                       'global', 'trash',     'sidebar',       'global:sidebar:view',      60),
('global:sidebar:config',       'Ver sección Configuración',           'Config maestra visible en sidebar',                 'global', 'config',    'sidebar',       'global:sidebar:view',      70)
ON CONFLICT (key) DO NOTHING;

-- ── Global: raíces de sección ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('global:dashboard:view',       'Ver dashboard',                       'Puede abrir y ver el dashboard',                    'global', 'dashboard', 'view',          'global:sidebar:dashboard', 100),
('global:users:view',           'Ver lista de usuarios',               'Puede ver la lista de usuarios del sistema',        'global', 'users',     'view',          'global:sidebar:users',     110),
('global:roles:view',           'Ver roles globales',                  'Puede ver la lista de roles',                       'global', 'roles',     'view',          'global:sidebar:roles',     120),
('global:reports:view',         'Ver reportes globales',               'Puede ver reportes del sistema',                    'global', 'reports',   'view',          'global:sidebar:reports',   130),
('global:trash:view',           'Ver papelera',                        'Puede ver elementos en papelera',                   'global', 'trash',     'view',          'global:sidebar:trash',     140),
('global:config:view',          'Ver configuración maestra',           'Puede ver la página de configuración',              'global', 'config',    'view',          'global:sidebar:config',    150)
ON CONFLICT (key) DO NOTHING;

-- ── Global: acciones ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('global:dashboard:modules_view','Ver módulos en dashboard',           'Puede ver las tarjetas de módulos',                 'global', 'dashboard', 'modules_view',  'global:dashboard:view',    200),
('global:users:create',         'Crear usuarios',                      'Puede crear nuevos usuarios',                       'global', 'users',     'create',        'global:users:view',        210),
('global:users:edit',           'Editar usuarios',                     'Puede editar información de usuarios',              'global', 'users',     'edit',          'global:users:view',        220),
('global:users:delete',         'Eliminar usuarios',                   'Puede eliminar usuarios (soft-delete)',              'global', 'users',     'delete',        'global:users:view',        230),
('global:users:assign_role',    'Asignar roles globales',              'Puede cambiar el rol global de un usuario',         'global', 'users',     'assign_role',   'global:users:view',        240),
('global:roles:create',         'Crear roles',                         'Puede crear nuevos roles globales',                 'global', 'roles',     'create',        'global:roles:view',        250),
('global:roles:edit',           'Editar roles',                        'Puede editar roles existentes',                     'global', 'roles',     'edit',          'global:roles:view',        260),
('global:roles:delete',         'Eliminar roles',                      'Puede eliminar roles',                              'global', 'roles',     'delete',        'global:roles:view',        270),
('global:roles:assign_perms',   'Gestionar permisos de roles',         'Puede asignar/quitar permisos a roles',             'global', 'roles',     'assign_perms',  'global:roles:view',        280),
('global:trash:restore',        'Restaurar desde papelera',            'Puede restaurar elementos eliminados',              'global', 'trash',     'restore',       'global:trash:view',        290),
('global:trash:purge',          'Eliminar definitivamente',            'Puede borrar de forma permanente',                  'global', 'trash',     'purge',         'global:trash:view',        300),
('global:config:company',       'Editar datos de empresa',             'Puede editar nombre, logo, colores, etc.',          'global', 'config',    'company',       'global:config:view',       310),
('global:config:org',           'Gestionar organización',              'Puede gestionar sedes, departamentos, cargos',      'global', 'config',    'org',           'global:config:view',       320),
('global:config:sla',           'Gestionar reglas SLA',                'Puede editar los tiempos de resolución',            'global', 'config',    'sla',           'global:config:view',       330),
('global:config:request_types', 'Gestionar tipos de solicitud',        'Puede activar/editar tipos de solicitud',           'global', 'config',    'request_types', 'global:config:view',       340),
('global:config:bulk_import',   'Importar usuarios masivamente',       'Puede hacer importación masiva de usuarios',        'global', 'config',    'bulk_import',   'global:config:view',       350),
('global:config:roles_perms',   'Gestionar roles y permisos',          'Puede configurar permisos del sistema',             'global', 'config',    'roles_perms',   'global:config:view',       360)
ON CONFLICT (key) DO NOTHING;

-- ── Gestión Administrativa: raíces ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('gestion:requests:view_own',   'Ver solicitudes propias',             'Puede ver sus propias solicitudes',                 'gestion', 'requests', 'view_own',     NULL,                       400),
('gestion:requests:view_all',   'Ver todas las solicitudes',           'Ve todas las solicitudes (vista admin)',             'gestion', 'requests', 'view_all',     NULL,                       410),
('gestion:roles:view',          'Ver roles del módulo',                'Puede ver los roles del módulo',                    'gestion', 'roles',    'view',          NULL,                       420),
('gestion:users:view',          'Ver usuarios del módulo',             'Puede ver usuarios asignados al módulo',            'gestion', 'users',    'view',          NULL,                       430),
('gestion:reports:view',        'Ver reportes del módulo',             'Puede ver reportes de gestión',                     'gestion', 'reports',  'view',          NULL,                       440),
('gestion:trash:view',          'Ver papelera del módulo',             'Puede ver la papelera del módulo',                  'gestion', 'trash',    'view',          NULL,                       450)
ON CONFLICT (key) DO NOTHING;

-- ── Gestión Administrativa: acciones ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('gestion:requests:create',     'Crear solicitudes',                   'Puede crear nuevas solicitudes',                    'gestion', 'requests', 'create',        'gestion:requests:view_own', 500),
('gestion:requests:take',       'Tomar solicitudes',                   'Puede asignarse solicitudes',                       'gestion', 'requests', 'take',          'gestion:requests:view_all', 510),
('gestion:requests:progress',   'Actualizar progreso',                 'Puede actualizar el estado de progreso',            'gestion', 'requests', 'progress',      'gestion:requests:view_all', 520),
('gestion:requests:approve',    'Aprobar solicitudes',                 'Puede aprobar solicitudes',                         'gestion', 'requests', 'approve',       'gestion:requests:view_all', 530),
('gestion:requests:reject',     'Rechazar solicitudes',                'Puede rechazar solicitudes',                        'gestion', 'requests', 'reject',        'gestion:requests:view_all', 540),
('gestion:requests:escalate',   'Escalar solicitudes',                 'Puede escalar solicitudes a nivel superior',        'gestion', 'requests', 'escalate',      'gestion:requests:view_all', 550),
('gestion:roles:create',        'Crear roles de módulo',               'Puede crear roles dentro del módulo',               'gestion', 'roles',    'create',        'gestion:roles:view',        560),
('gestion:roles:edit',          'Editar roles de módulo',              'Puede editar roles del módulo',                     'gestion', 'roles',    'edit',          'gestion:roles:view',        570),
('gestion:roles:delete',        'Eliminar roles de módulo',            'Puede eliminar roles del módulo',                   'gestion', 'roles',    'delete',        'gestion:roles:view',        580),
('gestion:users:assign_role',   'Asignar rol de módulo',               'Puede asignar rol de módulo a usuarios',            'gestion', 'users',    'assign_role',   'gestion:users:view',        590),
('gestion:trash:restore',       'Restaurar de papelera',               'Puede restaurar elementos del módulo',              'gestion', 'trash',    'restore',       'gestion:trash:view',        600)
ON CONFLICT (key) DO NOTHING;

-- ── Helpdesk: raíz ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('helpdesk:tickets:view',       'Ver tickets',                         'Puede ver los tickets de soporte',                  'helpdesk', 'tickets', 'view',          NULL,                       700)
ON CONFLICT (key) DO NOTHING;

-- ── Helpdesk: acciones ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('helpdesk:tickets:create',     'Crear tickets',                       'Puede crear nuevos tickets',                        'helpdesk', 'tickets', 'create',        'helpdesk:tickets:view',    710),
('helpdesk:tickets:edit',       'Editar tickets',                      'Puede editar tickets existentes',                   'helpdesk', 'tickets', 'edit',          'helpdesk:tickets:view',    720),
('helpdesk:tickets:close',      'Cerrar tickets',                      'Puede cerrar tickets',                              'helpdesk', 'tickets', 'close',         'helpdesk:tickets:view',    730),
('helpdesk:tickets:delete',     'Eliminar tickets',                    'Puede eliminar tickets',                            'helpdesk', 'tickets', 'delete',        'helpdesk:tickets:view',    740),
('helpdesk:tickets:assign',     'Asignar tickets',                     'Puede asignar tickets a agentes',                   'helpdesk', 'tickets', 'assign',        'helpdesk:tickets:view',    750),
('helpdesk:comments:add',       'Agregar comentarios',                 'Puede comentar en tickets',                         'helpdesk', 'comments','add',           'helpdesk:tickets:view',    760),
('helpdesk:comments:delete',    'Eliminar comentarios',                'Puede eliminar comentarios',                        'helpdesk', 'comments','delete',        'helpdesk:comments:add',    770)
ON CONFLICT (key) DO NOTHING;

-- ── Inventario: raíz ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('inventario:items:view',       'Ver inventario',                      'Puede ver los ítems del inventario',                'inventario', 'items', 'view',          NULL,                       800)
ON CONFLICT (key) DO NOTHING;

-- ── Inventario: acciones ──
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
('inventario:items:create',     'Crear ítems',                         'Puede agregar ítems al inventario',                 'inventario', 'items', 'create',        'inventario:items:view',    810),
('inventario:items:edit',       'Editar ítems',                        'Puede editar ítems existentes',                     'inventario', 'items', 'edit',          'inventario:items:view',    820),
('inventario:items:delete',     'Eliminar ítems',                      'Puede eliminar ítems del inventario',               'inventario', 'items', 'delete',        'inventario:items:view',    830)
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Seeds — grants para roles globales existentes
-- ─────────────────────────────────────────────────────────────────────────────

-- SUPERADMIN → todos los permisos
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name = 'superadmin' AND pd.is_active = TRUE
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ADMIN / ADMIN_GLOBAL
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name IN ('admin', 'admin_global')
  AND  pd.key IN (
        'global:system:access','global:sidebar:view',
        'global:sidebar:dashboard','global:dashboard:view','global:dashboard:modules_view',
        'global:sidebar:users','global:users:view','global:users:create',
        'global:users:edit','global:users:delete','global:users:assign_role',
        'global:sidebar:reports','global:reports:view',
        'global:sidebar:trash','global:trash:view','global:trash:restore'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- USUARIO / USER / EMPLEADO
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM   config.global_roles gr
CROSS  JOIN config.permission_definitions pd
WHERE  gr.name IN ('user','usuario','empleado','member')
  AND  pd.key IN (
        'global:system:access','global:sidebar:view',
        'global:sidebar:dashboard','global:dashboard:view','global:dashboard:modules_view'
       )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Eliminar sistema de permisos antiguo
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS modules.role_permissions;
DROP TABLE IF EXISTS modules.permissions;

COMMIT;

-- Verificación
SELECT scope, count(*) AS permisos
FROM config.permission_definitions
GROUP BY scope ORDER BY scope;

SELECT gr.name AS rol, count(rpg.permission_key) AS grants
FROM config.global_roles gr
LEFT JOIN config.role_permission_grants rpg ON rpg.role_id = gr.id
GROUP BY gr.name ORDER BY gr.name;
