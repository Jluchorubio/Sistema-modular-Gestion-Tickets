-- =============================================================================
-- Migration 006: SLA Calendar + Damage Type Catalog
-- Apply: psql $DATABASE_URL -f migrations/006_sla_calendar.sql
--
-- Adds:
--   config.ticket_categories   — structured category catalog (Hardware, Software, etc.)
--   tickets.damage_types       — subcategories per ticket_category with SLA weights
--   config.business_hours      — working hours per module (NULL = global)
--   config.holidays            — holidays per module (NULL = global)
--   tickets.tickets.damage_type_id — new column linking ticket to damage type
--
-- Seeds:
--   8 categories, ~50 damage types, L-V schedule, CO holidays 2025-2026
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. config.ticket_categories
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config.ticket_categories (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    slug        varchar(50)  NOT NULL,
    label       varchar(100) NOT NULL,
    description text,
    icon        varchar(50),
    color       varchar(7),
    sort_order  integer      NOT NULL DEFAULT 0,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_categories    PRIMARY KEY (id),
    CONSTRAINT uq_ticket_cat_slug      UNIQUE (slug)
);

CREATE TRIGGER trg_ticket_categories_updated_at
    BEFORE UPDATE ON config.ticket_categories
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. tickets.damage_types
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets.damage_types (
    id               uuid           NOT NULL DEFAULT gen_random_uuid(),
    category_id      uuid           NOT NULL,
    slug             varchar(100)   NOT NULL,
    label            varchar(150)   NOT NULL,
    description      text,
    default_priority priority_level NOT NULL DEFAULT 'media',
    weight           integer        NOT NULL DEFAULT 5,
    allow_freetext   boolean        NOT NULL DEFAULT true,
    is_other         boolean        NOT NULL DEFAULT false,
    is_active        boolean        NOT NULL DEFAULT true,
    sort_order       integer        NOT NULL DEFAULT 0,
    created_at       timestamptz    NOT NULL DEFAULT now(),
    updated_at       timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT pk_damage_types          PRIMARY KEY (id),
    CONSTRAINT uq_damage_type_slug      UNIQUE (slug),
    CONSTRAINT damage_type_weight_range CHECK (weight BETWEEN 1 AND 10),
    CONSTRAINT fk_damage_type_category  FOREIGN KEY (category_id)
        REFERENCES config.ticket_categories(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_damage_types_category ON tickets.damage_types (category_id) WHERE is_active = true;

CREATE TRIGGER trg_damage_types_updated_at
    BEFORE UPDATE ON tickets.damage_types
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. config.business_hours
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config.business_hours (
    id          uuid      NOT NULL DEFAULT gen_random_uuid(),
    module_id   uuid,
    day_of_week smallint  NOT NULL,
    start_time  time      NOT NULL,
    end_time    time      NOT NULL,
    is_active   boolean   NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_business_hours          PRIMARY KEY (id),
    CONSTRAINT bh_day_range               CHECK (day_of_week BETWEEN 0 AND 6),
    CONSTRAINT bh_time_range              CHECK (end_time > start_time),
    CONSTRAINT uq_business_hours_day      UNIQUE NULLS NOT DISTINCT (module_id, day_of_week),
    CONSTRAINT fk_business_hours_module   FOREIGN KEY (module_id)
        REFERENCES modules.modules(id) ON DELETE CASCADE
);

CREATE TRIGGER trg_business_hours_updated_at
    BEFORE UPDATE ON config.business_hours
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. config.holidays
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS config.holidays (
    id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    module_id    uuid,
    holiday_date date        NOT NULL,
    name         varchar(150) NOT NULL,
    is_active    boolean     NOT NULL DEFAULT true,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_holidays              PRIMARY KEY (id),
    CONSTRAINT uq_holiday_date          UNIQUE NULLS NOT DISTINCT (module_id, holiday_date),
    CONSTRAINT fk_holidays_module       FOREIGN KEY (module_id)
        REFERENCES modules.modules(id) ON DELETE CASCADE
);

CREATE TRIGGER trg_holidays_updated_at
    BEFORE UPDATE ON config.holidays
    FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. tickets.tickets — add damage_type_id
-- ---------------------------------------------------------------------------
ALTER TABLE tickets.tickets
    ADD COLUMN IF NOT EXISTS damage_type_id uuid,
    ADD COLUMN IF NOT EXISTS custom_damage_description text;

ALTER TABLE tickets.tickets
    ADD CONSTRAINT IF NOT EXISTS fk_tickets_damage_type
    FOREIGN KEY (damage_type_id) REFERENCES tickets.damage_types(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_damage_type ON tickets.tickets (damage_type_id);

-- custom_damage_description is populated when damage_type.is_other = true
-- constraint enforced at application layer (not SQL, avoids partition complexity)

-- ---------------------------------------------------------------------------
-- 6. SEED — config.ticket_categories
-- ---------------------------------------------------------------------------
INSERT INTO config.ticket_categories (slug, label, description, icon, color, sort_order) VALUES
    ('hardware',        'Hardware',                 'Equipos físicos: PCs, laptops, monitores, periféricos', 'monitor',          '#3b82f6', 10),
    ('software',        'Software',                 'Sistemas operativos, aplicaciones, licencias',          'code-2',           '#8b5cf6', 20),
    ('red',             'Red y Conectividad',       'Internet, WiFi, VPN, switches, DNS',                   'wifi',             '#06b6d4', 30),
    ('accesos',         'Accesos y Cuentas',        'Contraseñas, permisos, cuentas bloqueadas, 2FA',        'lock',             '#f59e0b', 40),
    ('impresoras',      'Impresoras y Periféricos', 'Impresoras, escáneres, proyectores',                   'printer',          '#10b981', 50),
    ('correo',          'Correo Electrónico',       'Outlook, Gmail, configuración de correo corporativo',  'mail',             '#ec4899', 60),
    ('infraestructura', 'Infraestructura',          'Servidores, NAS, switches core, energía, backups',     'server',           '#ef4444', 70),
    ('otro',            'Otro',                     'Cualquier otro tipo de solicitud no clasificada',       'help-circle',      '#6b7280', 80)
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 7. SEED — tickets.damage_types
-- ---------------------------------------------------------------------------

-- ---- HARDWARE ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, slug, label, default_priority::priority_level, weight, true, is_other, sort_order
FROM config.ticket_categories tc
CROSS JOIN (VALUES
    ('hardware_no_enciende',      'No enciende',                        'alta',   9, false,  10),
    ('hardware_disco',            'Disco dañado / fallo de almacenamiento', 'alta', 9, false, 20),
    ('hardware_ram',              'RAM defectuosa',                     'alta',   8, false,  30),
    ('hardware_sobrecalentamiento','Sobrecalentamiento',                'alta',   7, false,  40),
    ('hardware_pantalla',         'Pantalla dañada / sin video',        'media',  7, false,  50),
    ('hardware_fisico',           'Daño físico (golpe, líquido)',        'media',  6, false,  60),
    ('hardware_lentitud',         'Lentitud extrema',                   'media',  5, false,  70),
    ('hardware_bateria',          'Batería dañada',                     'media',  5, false,  80),
    ('hardware_teclado',          'Teclado / mouse defectuoso',         'baja',   4, false,  90),
    ('hardware_puerto_usb',       'Puerto USB defectuoso',              'baja',   4, false, 100),
    ('hardware_otro',             'Otro',                               'media',  5, true,  110)
) AS dt(slug, label, default_priority, weight, is_other, sort_order)
WHERE tc.slug = 'hardware'
ON CONFLICT (slug) DO NOTHING;

-- ---- SOFTWARE ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, slug, label, default_priority::priority_level, weight, true, is_other, sort_order
FROM config.ticket_categories tc
CROSS JOIN (VALUES
    ('software_virus',          'Virus / malware / ransomware',       'critica', 10, false,  10),
    ('software_error_so',       'Error del sistema operativo',        'alta',    7, false,   20),
    ('software_crash',          'Aplicación se cierra inesperadamente','media',  6, false,   30),
    ('software_actualizacion',  'Falla en actualización',             'media',   6, false,   40),
    ('software_configuracion',  'Configuración incorrecta',           'media',   4, false,   50),
    ('software_licencia',       'Problema con licencias',             'media',   5, false,   60),
    ('software_instalacion',    'Instalación / desinstalación',       'baja',    3, false,   70),
    ('software_otro',           'Otro',                               'media',   5, true,    80)
) AS dt(slug, label, default_priority, weight, is_other, sort_order)
WHERE tc.slug = 'software'
ON CONFLICT (slug) DO NOTHING;

-- ---- RED ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, slug, label, default_priority::priority_level, weight, true, is_other, sort_order
FROM config.ticket_categories tc
CROSS JOIN (VALUES
    ('red_sin_internet',  'Sin acceso a internet',            'alta',  9, false, 10),
    ('red_dhcp',          'Sin IP / problema DHCP',           'alta',  8, false, 20),
    ('red_sin_vpn',       'Sin acceso VPN',                   'alta',  7, false, 30),
    ('red_puerto',        'Puerto de red físico dañado',      'alta',  7, false, 40),
    ('red_dns',           'Problema DNS / resolución nombres','alta',  7, false, 50),
    ('red_latencia',      'Latencia alta / lentitud de red',  'media', 6, false, 60),
    ('red_wifi',          'WiFi inestable',                   'media', 6, false, 70),
    ('red_otro',          'Otro',                             'media', 5, true,  80)
) AS dt(slug, label, default_priority, weight, is_other, sort_order)
WHERE tc.slug = 'red'
ON CONFLICT (slug) DO NOTHING;

-- ---- ACCESOS ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, slug, label, default_priority::priority_level, weight, true, is_other, sort_order
FROM config.ticket_categories tc
CROSS JOIN (VALUES
    ('accesos_cuenta_bloqueada', 'Cuenta bloqueada',                 'media', 6, false, 10),
    ('accesos_contrasena',       'Contraseña olvidada / expirada',   'media', 5, false, 20),
    ('accesos_sin_permiso',      'Sin permiso al sistema o recurso', 'media', 5, false, 30),
    ('accesos_2fa',              'Problema con doble factor (2FA)',   'media', 5, false, 40),
    ('accesos_nueva_cuenta',     'Solicitud de nueva cuenta',        'baja',  3, false, 50),
    ('accesos_otro',             'Otro',                             'media', 5, true,  60)
) AS dt(slug, label, default_priority, weight, is_other, sort_order)
WHERE tc.slug = 'accesos'
ON CONFLICT (slug) DO NOTHING;

-- ---- IMPRESORAS ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, slug, label, default_priority::priority_level, weight, true, is_other, sort_order
FROM config.ticket_categories tc
CROSS JOIN (VALUES
    ('impresora_no_imprime', 'No imprime',                       'media', 5, false, 10),
    ('impresora_conexion',   'Sin conexión a impresora',         'media', 5, false, 20),
    ('impresora_calidad',    'Calidad de impresión deficiente',  'baja',  3, false, 30),
    ('impresora_toner',      'Tóner / tinta agotada',            'baja',  3, false, 40),
    ('impresora_papel',      'Atasco de papel',                  'baja',  3, false, 50),
    ('impresora_otro',       'Otro',                             'baja',  3, true,  60)
) AS dt(slug, label, default_priority, weight, is_other, sort_order)
WHERE tc.slug = 'impresoras'
ON CONFLICT (slug) DO NOTHING;

-- ---- CORREO ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, slug, label, default_priority::priority_level, weight, true, is_other, sort_order
FROM config.ticket_categories tc
CROSS JOIN (VALUES
    ('correo_no_recibe',    'No recibe correos',                    'media', 7, false, 10),
    ('correo_no_envia',     'No puede enviar correos',              'media', 7, false, 20),
    ('correo_cuota',        'Cuota llena / sin espacio',            'media', 5, false, 30),
    ('correo_configuracion','Configuración de cuenta de correo',    'media', 4, false, 40),
    ('correo_spam',         'Exceso de spam / phishing',            'baja',  3, false, 50),
    ('correo_otro',         'Otro',                                 'media', 4, true,  60)
) AS dt(slug, label, default_priority, weight, is_other, sort_order)
WHERE tc.slug = 'correo'
ON CONFLICT (slug) DO NOTHING;

-- ---- INFRAESTRUCTURA ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, slug, label, default_priority::priority_level, weight, true, is_other, sort_order
FROM config.ticket_categories tc
CROSS JOIN (VALUES
    ('infra_servidor_caido',  'Servidor caído',                   'critica', 10, false, 10),
    ('infra_switch',          'Switch / router core caído',       'critica', 10, false, 20),
    ('infra_energia',         'Problema eléctrico / UPS',         'critica',  9, false, 30),
    ('infra_almacenamiento',  'Almacenamiento lleno / fallo NAS', 'alta',     8, false, 40),
    ('infra_backup',          'Falla en backup',                  'alta',     8, false, 50),
    ('infra_otro',            'Otro',                             'alta',     7, true,  60)
) AS dt(slug, label, default_priority, weight, is_other, sort_order)
WHERE tc.slug = 'infraestructura'
ON CONFLICT (slug) DO NOTHING;

-- ---- OTRO ----
INSERT INTO tickets.damage_types (category_id, slug, label, default_priority, weight, allow_freetext, is_other, sort_order)
SELECT id, 'otro_no_clasificado', 'No clasificado', 'media'::priority_level, 5, true, true, 10
FROM config.ticket_categories WHERE slug = 'otro'
ON CONFLICT (slug) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 8. SEED — config.business_hours (global, Colombia, L-V 7:00-17:00, Sáb 7:00-12:00)
-- ---------------------------------------------------------------------------
INSERT INTO config.business_hours (module_id, day_of_week, start_time, end_time) VALUES
    (NULL, 1, '07:00', '17:00'),  -- Lunes
    (NULL, 2, '07:00', '17:00'),  -- Martes
    (NULL, 3, '07:00', '17:00'),  -- Miércoles
    (NULL, 4, '07:00', '17:00'),  -- Jueves
    (NULL, 5, '07:00', '17:00'),  -- Viernes
    (NULL, 6, '07:00', '12:00')   -- Sábado (medio día)
ON CONFLICT (module_id, day_of_week) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 9. SEED — config.holidays (Colombia 2025-2026)
-- ---------------------------------------------------------------------------
INSERT INTO config.holidays (module_id, holiday_date, name) VALUES
    -- 2025
    (NULL, '2025-01-01', 'Año Nuevo'),
    (NULL, '2025-01-06', 'Día de los Reyes Magos'),
    (NULL, '2025-03-24', 'Día de San José'),
    (NULL, '2025-04-17', 'Jueves Santo'),
    (NULL, '2025-04-18', 'Viernes Santo'),
    (NULL, '2025-05-01', 'Día del Trabajo'),
    (NULL, '2025-06-02', 'Ascensión del Señor'),
    (NULL, '2025-06-23', 'Corpus Christi'),
    (NULL, '2025-06-30', 'Sagrado Corazón de Jesús'),
    (NULL, '2025-07-07', 'San Pedro y San Pablo'),
    (NULL, '2025-07-20', 'Día de la Independencia'),
    (NULL, '2025-08-07', 'Batalla de Boyacá'),
    (NULL, '2025-08-18', 'La Asunción de la Virgen'),
    (NULL, '2025-10-13', 'Día de la Raza'),
    (NULL, '2025-11-03', 'Todos los Santos'),
    (NULL, '2025-11-17', 'Independencia de Cartagena'),
    (NULL, '2025-12-08', 'Inmaculada Concepción'),
    (NULL, '2025-12-25', 'Navidad'),
    -- 2026
    (NULL, '2026-01-01', 'Año Nuevo'),
    (NULL, '2026-01-12', 'Día de los Reyes Magos'),
    (NULL, '2026-03-23', 'Día de San José'),
    (NULL, '2026-04-02', 'Jueves Santo'),
    (NULL, '2026-04-03', 'Viernes Santo'),
    (NULL, '2026-05-01', 'Día del Trabajo'),
    (NULL, '2026-05-18', 'Ascensión del Señor'),
    (NULL, '2026-06-08', 'Corpus Christi'),
    (NULL, '2026-06-15', 'Sagrado Corazón de Jesús'),
    (NULL, '2026-06-29', 'San Pedro y San Pablo'),
    (NULL, '2026-07-20', 'Día de la Independencia'),
    (NULL, '2026-08-07', 'Batalla de Boyacá'),
    (NULL, '2026-08-17', 'La Asunción de la Virgen'),
    (NULL, '2026-10-12', 'Día de la Raza'),
    (NULL, '2026-11-02', 'Todos los Santos'),
    (NULL, '2026-11-16', 'Independencia de Cartagena'),
    (NULL, '2026-12-08', 'Inmaculada Concepción'),
    (NULL, '2026-12-25', 'Navidad')
ON CONFLICT (module_id, holiday_date) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
-- SELECT slug, label FROM config.ticket_categories ORDER BY sort_order;
-- SELECT tc.slug AS cat, dt.slug, dt.label, dt.default_priority, dt.weight
-- FROM tickets.damage_types dt JOIN config.ticket_categories tc ON tc.id = dt.category_id
-- ORDER BY tc.sort_order, dt.sort_order;
-- SELECT day_of_week, start_time, end_time FROM config.business_hours WHERE module_id IS NULL ORDER BY day_of_week;
-- SELECT holiday_date, name FROM config.holidays WHERE module_id IS NULL ORDER BY holiday_date;
