-- ============================================================================
-- MIGRATION_v8_phase3.sql — Fase 3: Configuración Maestra del Sistema
-- Aplica sobre DB_FINAL_v7_0 existente en Railway
-- TODAS las operaciones son aditivas (no rompen datos existentes)
-- EXCEPCIÓN: CHECK constraint de tipos de solicitud (se actualiza)
-- ============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Schema org (estructura organizacional global)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS org;

-- org.headquarters — sedes físicas de la empresa
CREATE TABLE IF NOT EXISTS org.headquarters (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR(200) NOT NULL,
    address     TEXT,
    city        VARCHAR(100),
    country     VARCHAR(100) NOT NULL DEFAULT 'Colombia',
    phone       VARCHAR(30),
    email       VARCHAR(255),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_headquarters PRIMARY KEY (id),
    CONSTRAINT uq_headquarters_name UNIQUE (name)
);

-- org.departments — áreas grandes de la empresa
CREATE TABLE IF NOT EXISTS org.departments (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    description TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_departments PRIMARY KEY (id),
    CONSTRAINT uq_departments_name UNIQUE (name)
);

-- org.areas — sub-áreas dentro de un departamento
CREATE TABLE IF NOT EXISTS org.areas (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    department_id   UUID        REFERENCES org.departments(id) ON DELETE SET NULL,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_areas PRIMARY KEY (id)
);

-- org.positions — cargos con nivel jerárquico para cálculo de prioridad
-- level: 1=operativo, 2=jefe área, 3=coordinador, 4=director, 5=gerente, 6=VP/C-Suite
CREATE TABLE IF NOT EXISTS org.positions (
    id          UUID        NOT NULL DEFAULT gen_random_uuid(),
    name        VARCHAR(150) NOT NULL,
    level       INTEGER     NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
    description TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_positions PRIMARY KEY (id),
    CONSTRAINT uq_positions_name UNIQUE (name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Expandir users.organizations con campos de empresa
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users.organizations
    ADD COLUMN IF NOT EXISTS logo_url        TEXT,
    ADD COLUMN IF NOT EXISTS primary_color   VARCHAR(20) DEFAULT '#6366f1',
    ADD COLUMN IF NOT EXISTS website         VARCHAR(255),
    ADD COLUMN IF NOT EXISTS contact_email   VARCHAR(255),
    ADD COLUMN IF NOT EXISTS contact_phone   VARCHAR(30),
    ADD COLUMN IF NOT EXISTS fiscal_id       VARCHAR(50),
    ADD COLUMN IF NOT EXISTS industry        VARCHAR(100),
    ADD COLUMN IF NOT EXISTS employee_count  INTEGER;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. FK campos en users.profiles (nullable — backward compat)
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE users.profiles
    ADD COLUMN IF NOT EXISTS headquarters_id UUID REFERENCES org.headquarters(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS department_id   UUID REFERENCES org.departments(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS area_id         UUID REFERENCES org.areas(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS position_id     UUID REFERENCES org.positions(id) ON DELETE SET NULL;

-- Índices para FK lookups frecuentes
CREATE INDEX IF NOT EXISTS idx_profiles_headquarters ON users.profiles (headquarters_id) WHERE headquarters_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_position ON users.profiles (position_id) WHERE position_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Nuevas tablas config
-- ─────────────────────────────────────────────────────────────────────────────

-- config.sla_rules — SLA por tipo + prioridad
CREATE TABLE IF NOT EXISTS config.sla_rules (
    id                       UUID        NOT NULL DEFAULT gen_random_uuid(),
    request_type             VARCHAR(50),        -- NULL = aplica a todos los tipos
    priority                 VARCHAR(20) NOT NULL,
    hours_to_resolve         INTEGER     NOT NULL CHECK (hours_to_resolve > 0),
    hours_to_first_response  INTEGER     NOT NULL DEFAULT 1 CHECK (hours_to_first_response > 0),
    is_active                BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_sla_rules PRIMARY KEY (id),
    CONSTRAINT uq_sla_type_priority UNIQUE (request_type, priority),
    CONSTRAINT sla_rules_priority_check CHECK (priority IN ('baja','media','alta','critica'))
);

-- config.priority_rules — lógica de auto-cálculo de prioridad
CREATE TABLE IF NOT EXISTS config.priority_rules (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    request_type        VARCHAR(50) NOT NULL,
    base_priority       VARCHAR(20) NOT NULL DEFAULT 'media',
    position_level_min  INTEGER,                -- Si cargo >= este nivel, usar elevated_priority
    elevated_priority   VARCHAR(20),
    notes               TEXT,
    is_active           BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT pk_priority_rules PRIMARY KEY (id),
    CONSTRAINT uq_priority_rules_type UNIQUE (request_type),
    CONSTRAINT priority_rules_base_check CHECK (base_priority IN ('baja','media','alta','critica')),
    CONSTRAINT priority_rules_elevated_check CHECK (elevated_priority IS NULL OR elevated_priority IN ('baja','media','alta','critica'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Marcar roles de módulo como admin
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE modules.module_roles
    ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- Marcar los roles admin_modulo existentes como is_admin=TRUE
UPDATE modules.module_roles
SET is_admin = TRUE
WHERE LOWER(name) IN ('admin_modulo', 'admin modulo', 'administrador', 'administrator', 'admin');

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Columnas nuevas en requests.admin_requests
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE requests.admin_requests
    ADD COLUMN IF NOT EXISTS assigned_to   UUID,
    ADD COLUMN IF NOT EXISTS auto_priority BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_admin_requests_assigned ON requests.admin_requests (assigned_to) WHERE assigned_to IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Actualizar CHECK constraint de tipos de solicitud
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE requests.admin_requests
    DROP CONSTRAINT IF EXISTS admin_requests_type_check;

ALTER TABLE requests.admin_requests
    ADD CONSTRAINT admin_requests_type_check
    CHECK (type IN (
        'role_change',
        'module_access',
        'permission_adjustment',
        'account_issue',
        'reactivation',
        'other',
        'task',
        'access_revocation',
        'user_transfer',
        'technical_issue',
        'data_correction'
    ));

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Seeds — SLA por defecto
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.sla_rules (request_type, priority, hours_to_resolve, hours_to_first_response)
VALUES
    -- Reglas globales (sin tipo específico)
    (NULL, 'critica', 2,  1),
    (NULL, 'alta',    8,  2),
    (NULL, 'media',   24, 4),
    (NULL, 'baja',    72, 8),
    -- Reglas específicas por tipo crítico
    ('reactivation',      'media',   4, 1),
    ('account_issue',     'media',   4, 1),
    ('access_revocation', 'alta',    4, 1),
    ('technical_issue',   'alta',    6, 1)
ON CONFLICT (request_type, priority) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Seeds — Reglas de prioridad por defecto
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO config.priority_rules (request_type, base_priority, position_level_min, elevated_priority, notes)
VALUES
    ('role_change',          'media', 4, 'alta',    'Directores+ obtienen alta prioridad'),
    ('module_access',        'media', 3, 'alta',    'Coordinadores+ obtienen alta prioridad'),
    ('permission_adjustment','media', 3, 'alta',    'Coordinadores+ obtienen alta prioridad'),
    ('account_issue',        'alta',  NULL, NULL,   'Siempre alta — bloquea acceso del usuario'),
    ('reactivation',         'alta',  NULL, NULL,   'Siempre alta — usuario bloqueado'),
    ('access_revocation',    'alta',  NULL, NULL,   'Siempre alta — seguridad'),
    ('user_transfer',        'media', 4, 'alta',    'Directores+ obtienen alta prioridad'),
    ('technical_issue',      'media', 3, 'alta',    'Coordinadores+ obtienen alta prioridad'),
    ('data_correction',      'baja',  4, 'media',   'Directores+ obtienen media prioridad'),
    ('other',                'media', NULL, NULL,   'Tipo general — prioridad manual permitida'),
    ('task',                 'media', NULL, NULL,   'Tareas internas')
ON CONFLICT (request_type) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Triggers updated_at para tablas nuevas
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'org.headquarters',
    'org.departments',
    'org.areas',
    'org.positions',
    'config.sla_rules',
    'config.priority_rules'
  ]
  LOOP
    EXECUTE format('
      DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
      CREATE TRIGGER trg_%s_updated_at
        BEFORE UPDATE ON %s
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
    ', replace(t, '.', '_'), t, replace(t, '.', '_'), t);
  END LOOP;
END;
$$;

COMMIT;

-- Verificación
SELECT 'org.headquarters'  AS tabla, count(*) FROM org.headquarters  UNION ALL
SELECT 'org.departments'   AS tabla, count(*) FROM org.departments   UNION ALL
SELECT 'org.areas'         AS tabla, count(*) FROM org.areas         UNION ALL
SELECT 'org.positions'     AS tabla, count(*) FROM org.positions     UNION ALL
SELECT 'config.sla_rules'  AS tabla, count(*) FROM config.sla_rules  UNION ALL
SELECT 'config.priority_rules' AS tabla, count(*) FROM config.priority_rules;
