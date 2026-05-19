-- ============================================================================
-- MIGRATION_v8_phase3b.sql — Tipos de solicitud configurables desde Master Config
-- Aplica sobre MIGRATION_v8_phase3 ya aplicado
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Tabla config.request_type_config
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config.request_type_config (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    type_key              VARCHAR(50) NOT NULL,
    label                 VARCHAR(100) NOT NULL,
    description           TEXT,
    is_active             BOOLEAN     NOT NULL DEFAULT TRUE,
    requires_module       BOOLEAN     NOT NULL DEFAULT FALSE,
    allows_manual_priority BOOLEAN    NOT NULL DEFAULT FALSE,
    sort_order            INTEGER     NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_request_type_config PRIMARY KEY (id),
    CONSTRAINT uq_request_type_key    UNIQUE (type_key)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Eliminar CHECK hardcodeado en admin_requests — ahora lo valida el backend
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE requests.admin_requests DROP CONSTRAINT IF EXISTS admin_requests_type_check;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seeds de tipos de solicitud
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.request_type_config
    (type_key, label, description, is_active, requires_module, allows_manual_priority, sort_order)
VALUES
    ('role_change',           'Cambio de rol',           'Cambiar el rol de un usuario dentro de un módulo',           TRUE,  TRUE,  FALSE, 1),
    ('module_access',         'Acceso a módulo',         'Solicitar acceso a un módulo del sistema',                   TRUE,  TRUE,  FALSE, 2),
    ('permission_adjustment', 'Ajuste de permisos',      'Modificar permisos específicos dentro de un módulo',         TRUE,  TRUE,  FALSE, 3),
    ('account_issue',         'Problema de cuenta',      'Bloqueos, acceso o problemas con la cuenta de usuario',      TRUE,  FALSE, FALSE, 4),
    ('reactivation',          'Reactivación',            'Reactivar cuenta o acceso de usuario inactivo',              TRUE,  FALSE, FALSE, 5),
    ('access_revocation',     'Revocación de acceso',   'Revocar acceso de un usuario a módulo o sistema',            TRUE,  TRUE,  FALSE, 6),
    ('user_transfer',         'Traslado de usuario',     'Transferir usuario entre módulos, sedes o departamentos',    TRUE,  FALSE, FALSE, 7),
    ('technical_issue',       'Problema técnico',        'Problema técnico con un módulo o funcionalidad',             TRUE,  TRUE,  FALSE, 8),
    ('data_correction',       'Corrección de datos',     'Corrección de datos empresariales o registros incorrectos',  TRUE,  FALSE, FALSE, 9),
    ('other',                 'Otro',                    'Solicitud general o no categorizada — prioridad configurable', TRUE, FALSE, TRUE,  10),
    ('task',                  'Tarea interna',           'Tarea asignada internamente por administrador',              TRUE,  FALSE, FALSE, 11)
ON CONFLICT (type_key) DO NOTHING;

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_config_request_type_config_updated_at ON config.request_type_config;
CREATE TRIGGER trg_config_request_type_config_updated_at
    BEFORE UPDATE ON config.request_type_config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;

SELECT type_key, label, is_active, requires_module, allows_manual_priority
FROM config.request_type_config ORDER BY sort_order;
