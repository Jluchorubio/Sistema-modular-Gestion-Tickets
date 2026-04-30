-- ============================================================================
-- SISTEMA MODULAR DE GESTIÓN DE TICKETS — v5.0 SINGLE-TENANT
-- PostgreSQL 15+ | Generado: 2026-04-27
-- ============================================================================

-- ============================================================================
-- CHANGELOG v5.0 → v5.1
-- ============================================================================
-- FIX-1  : assign_ticket_hybrid reescrito con round-robin REAL (advisory locks
--          + lectura de last_assigned_user_id + ORDER BY cíclico)        ~L2050
-- FIX-2  : ticket_assignment_counters con UNIQUE NULLS NOT DISTINCT      ~L1135
-- FIX-3  : modules.resolve_sla eliminada; nueva tickets.resolve_sla      ~L1830
-- FIX-4  : Bloque /* JOBS pg_cron */ migrado a comentarios de línea --   ~L2790
-- FIX-5  : UNIQUE INDEX parcial (ticket_id) WHERE role='owner' AND...    ~L915
-- FIX-6  : FKs same-schema en tickets.tickets (workflow_version, state,
--          sla_policy)                                                   ~L840
-- FIX-7  : RLS — función app.is_superadmin() y políticas actualizadas    ~L1820
-- FIX-8  : Trigger fn_ticket_state_history en AFTER UPDATE de state,
--          eliminada inserción manual en execute_transition              ~L1535
-- FIX-9  : updated_at + created_at agregados/triggereados en 13 tablas
--          (auth.refresh_tokens, auth.sessions, auth.token_revocation_list,
--           tickets.sla_conditions, tickets.ticket_approvals,
--           inventory.asset_relationships, inventory.ticket_assets,
--           inventory.asset_assignment_history, notifications.notification_logs,
--           modules.permissions, modules.role_permissions,
--           modules.technician_assignment_log, modules.ticket_assets)    varios
-- FIX-10 : modules.config / modules.assets / modules.ticket_assets
--          marcadas [DEPRECATED] (no se eliminan para no romper FKs)     ~L1635
-- FIX-11 : Todos los CREATE TRIGGER envueltos en DO $$ EXCEPTION ...     varios
-- FIX-12 : Auditoría ampliada a tickets.ticket_assignments,
--          tickets.assignment_policies, auth.credentials, users.profiles,
--          tickets.sla_policies, tickets.sla_rules,
--          modules.user_module_roles                                     ~L2615
-- FIX-13 : INDEX (no UNIQUE) global (id) en tickets.tickets — PG no permite
--          UNIQUE en particionada sin incluir partition key. La unicidad
--          práctica la garantiza gen_random_uuid().                     ~L840
-- FIX-14 : Eliminado idx_ta_user_active_module (redundante)              ~L905
-- ============================================================================

--
-- CAMBIOS v5.0 sobre v4.1 (alineación total con el prompt original):
--
-- [v5-1]  Schemas renombrados/añadidos para coincidir exactamente con el prompt:
--           auth   (nuevo) — credenciales, tokens JWT, sesiones, revocación
--           users  (ajustado) — profiles + preferences, SIN credenciales
--           config (nuevo) — module_settings + feature_flags
--           events (nuevo) — outbox pattern (reemplaza audit.domain_events para mensajería)
--         Se conservan schemas no contemplados en el prompt que aportan valor:
--           app, reports, maintenance (utilidades)
--
-- [v5-2]  Schema auth completo:
--           auth.credentials, auth.refresh_tokens, auth.sessions,
--           auth.token_revocation_list
--
-- [v5-3]  Schema users reescrito:
--           users.profiles (id=UUID del credential, is_superadmin)
--           users.preferences (language, timezone, notificaciones, ui_settings)
--         Eliminado users.users (reemplazado por users.profiles)
--         Conservado users.organizations (compatibilidad single-tenant)
--
-- [v5-4]  Schema tickets alineado con el prompt:
--           tickets.workflow_versions + states + transitions + transition_rules
--           tickets.sla_policies + sla_rules + sla_conditions (motor data-driven)
--           tickets.ticket_assignments (owner/collaborator/observer, is_active)
--           tickets.ticket_state_history (inmutable)
--           tickets.ticket_sla_tracking (paused/resumed/breached)
--           tickets.ticket_approvals (firma digital, token, expires_at)
--           tickets.ticket_comments (comment_type: internal/public)
--           tickets.technician_availability (day_of_week, start_time, end_time)
--           tickets.technician_leaves (start_date/end_date)
--           tickets.technician_category_skills (UNIQUE user+module+category)
--           tickets.technician_profiles (generalist/specialist/both, max_daily_tickets)
--           tickets.assignment_policies (use_specialists, use_generalists, overflow,
--                                        threshold, assignment_method)
--           tickets.ticket_assignment_counters (last_assigned_user_id, puntero RR)
--
-- [v5-5]  Schema inventory completo según el prompt:
--           inventory.assets (qr_code UNIQUE, version, parent_asset_id)
--           inventory.asset_relationships
--           inventory.ticket_assets
--           inventory.asset_requests
--           inventory.asset_assignments (activo/devuelto/transferido)
--           inventory.asset_assignment_history (inmutable)
--           inventory.asset_procurement_requests
--
-- [v5-6]  Schema files ajustado: columnas del prompt
--           (entity_type/entity_id, is_confirmed, expires_at)
--
-- [v5-7]  Schema notifications ajustado:
--           notifications.notification_templates (event_type+channel UNIQUE)
--           notifications.notification_logs
--
-- [v5-8]  Schema audit alineado:
--           audit.event_log (actor_type: user/system/job, action, entity_type/id)
--
-- [v5-9]  Schema events (outbox pattern puro):
--           events.outbox (aggregate_type, status, retries, scheduled_at)
--
-- [v5-10] Schema config (module_settings + feature_flags):
--           config.module_settings (module_id NULL = global, key, value_type, version)
--           config.feature_flags (module_id NULL = global)
--
-- [v5-11] Enums globales: priority_level, urgency_level, impact_level,
--           ticket_status, asset_status, assignment_role, technician_type,
--           assignment_method, approval_status, notification_channel,
--           notification_status, outbox_status, action_type
--
-- [v5-12] Triggers obligatorios del prompt:
--           set_updated_at (todas las tablas con updated_at)
--           trg_assets_generate_qr (BEFORE INSERT en inventory.assets)
--           trg_ticket_state_audit (AFTER UPDATE OF current_state_id)
--           trg_ticket_version_bump (BEFORE UPDATE en tickets.tickets)
--           trg_asset_version_bump (BEFORE UPDATE en inventory.assets)
--
-- [v5-13] Particionado correcto:
--           tickets.tickets, tickets.ticket_state_history,
--           audit.event_log, notifications.notification_logs
--           + particiones 2026-01 a 2027-12 generadas en DO block
--
-- [v5-14] Índices obligatorios del prompt: completados en su totalidad
--
-- [v5-15] FK cross-schema: ELIMINADAS. Relaciones entre schemas son solo UUID lógicos.
--           FK dentro del mismo schema: conservadas.
--
-- [v5-16] Conservado de v4.1 (valor adicional no contradictorio):
--           modules.bootstrap_module() — inicialización atómica de módulo
--           modules.v_available_technicians — vista de asignación en tiempo real
--           tickets.assign_ticket_hybrid() — algoritmo de asignación completo
--           tickets.execute_transition() — ejecución FSM
--           reports.* — vistas materializadas de KPIs
--           RLS — políticas de acceso por rol/módulo
--           maintenance.create_future_partitions()
--
-- INSTRUCCIONES:
--   1. Ejecutar en PostgreSQL 15+ VACÍA
--   2. Rol con CREATE SCHEMA + CREATE TABLE + CREATE FUNCTION
--   3. Script idempotente: IF NOT EXISTS en todas las creaciones
-- ============================================================================

-- ============================================================================
-- PARTE 0: EXTENSIONES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ============================================================================
-- PARTE 1: SCHEMAS
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS users;
CREATE SCHEMA IF NOT EXISTS config;
CREATE SCHEMA IF NOT EXISTS modules;
CREATE SCHEMA IF NOT EXISTS tickets;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS files;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS reports;
CREATE SCHEMA IF NOT EXISTS maintenance;

-- ============================================================================
-- PARTE 2: ENUMS GLOBALES
-- [v5-11] Solo para valores que NUNCA cambiarán en producción.
-- ============================================================================

-- Prioridad de ticket
DO $$ BEGIN
    CREATE TYPE public.priority_level AS ENUM ('baja','media','alta','critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Urgencia percibida por el usuario
DO $$ BEGIN
    CREATE TYPE public.urgency_level AS ENUM ('baja','media','alta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Impacto para el negocio
DO $$ BEGIN
    CREATE TYPE public.impact_level AS ENUM ('bajo','medio','alto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estado del ticket (workflow FSM)
DO $$ BEGIN
    CREATE TYPE public.ticket_status_enum AS ENUM
        ('abierto','en_espera','en_proceso','realizado','cerrado','reproceso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estado del activo físico
DO $$ BEGIN
    CREATE TYPE public.asset_status AS ENUM
        ('disponible','asignado','en_reparacion','dado_de_baja');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Rol del responsable en una asignación de ticket
DO $$ BEGIN
    CREATE TYPE public.assignment_role AS ENUM ('owner','collaborator','observer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Perfil de técnico para asignación híbrida
DO $$ BEGIN
    CREATE TYPE public.technician_type AS ENUM ('generalist','specialist','both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Método de distribución de tickets
DO $$ BEGIN
    CREATE TYPE public.assignment_method AS ENUM ('round_robin','least_load','hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estado de la aprobación de cierre
DO $$ BEGIN
    CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Canal de notificación
DO $$ BEGIN
    CREATE TYPE public.notification_channel AS ENUM ('email','whatsapp','in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estado de envío de notificación
DO $$ BEGIN
    CREATE TYPE public.notification_status AS ENUM ('pending','sent','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Estado de mensaje en el outbox
DO $$ BEGIN
    CREATE TYPE public.outbox_status AS ENUM ('pending','processing','processed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipo de acción en reglas de transición
DO $$ BEGIN
    CREATE TYPE public.action_type AS ENUM
        ('notify_user','escalate_ticket','change_priority',
         'reassign_technician','auto_close');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tipo de actor en auditoría
DO $$ BEGIN
    CREATE TYPE public.actor_type AS ENUM ('user','system','job');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 3: FUNCIÓN COMPARTIDA set_updated_at
-- [v5-12] Debe existir ANTES que cualquier tabla que la use en triggers.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.set_updated_at IS
    'Trigger genérico para actualizar updated_at = now() antes de cada UPDATE.
     Aplica a todas las tablas con columna updated_at.';

-- ============================================================================
-- PARTE 4: FUNCIONES DE CONTEXTO DE SESIÓN
-- ============================================================================

CREATE OR REPLACE FUNCTION app.get_current_user_id()
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app;

CREATE OR REPLACE FUNCTION app.get_current_organization_id()
RETURNS UUID AS $$
BEGIN
    -- SINGLE-TENANT: UUID fijo. No es discriminador de aislamiento.
    RETURN '00000000-0000-0000-0000-000000000001'::UUID;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app;

CREATE OR REPLACE FUNCTION app.get_current_module_id()
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_module_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app;

-- ============================================================================
-- PARTE 5: SCHEMA auth
-- [v5-2] Autenticación propia. NO Supabase, NO Auth0.
-- FK cross-schema PROHIBIDAS: user_id es UUID lógico referenciando users.profiles.
-- ============================================================================

-- ── auth.credentials ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.credentials (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- user_id = mismo UUID que users.profiles.id (relación lógica, sin FK cross-schema)
    user_id       UUID         NOT NULL UNIQUE,
    email         VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT         NOT NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_credentials_email   ON auth.credentials(email);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_user_id ON auth.credentials(user_id);

DO $TRG_AUTH_CREDENTIALS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_auth_credentials_updated_at
    BEFORE UPDATE ON auth.credentials
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_AUTH_CREDENTIALS_UPDATED_AT_DO$;

COMMENT ON TABLE auth.credentials IS
    'Credenciales de autenticación. user_id es FK lógica a users.profiles.id.
     Nunca almacenar password en texto plano — siempre password_hash (bcrypt/argon2).';

-- ── auth.refresh_tokens ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    -- Almacenar hash del token, nunca el valor raw
    token_hash  TEXT         NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ  NULL,
    ip_address  INET         NULL,
    user_agent  TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()  -- [FIX-9]
);

CREATE INDEX IF NOT EXISTS idx_auth_rt_user_id    ON auth.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_rt_token_hash ON auth.refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_rt_expires    ON auth.refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;

DO $RT_TRG$ BEGIN
    CREATE TRIGGER trg_auth_rt_updated_at
        BEFORE UPDATE ON auth.refresh_tokens
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $RT_TRG$;

COMMENT ON TABLE auth.refresh_tokens IS
    'Tokens de refresco JWT. token_hash = SHA-256 del token raw.
     Nunca almacenar el token en texto plano.';

-- ── auth.sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.sessions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    ip_address  INET         NULL,
    user_agent  TEXT         NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    ended_at    TIMESTAMPTZ  NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()  -- [FIX-9]
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth.sessions(expires_at)
    WHERE ended_at IS NULL;

DO $SES_TRG$ BEGIN
    CREATE TRIGGER trg_auth_sessions_updated_at
        BEFORE UPDATE ON auth.sessions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $SES_TRG$;

-- ── auth.token_revocation_list ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS auth.token_revocation_list (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    jti        UUID         NOT NULL UNIQUE,    -- JWT ID del token revocado
    user_id    UUID         NOT NULL,
    revoked_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reason     VARCHAR(100) NULL,
    -- Para limpiar registros vencidos sin afectar tokens aún activos
    expires_at TIMESTAMPTZ  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- [FIX-9]
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()   -- [FIX-9]
);

CREATE INDEX IF NOT EXISTS idx_auth_trl_jti        ON auth.token_revocation_list(jti);
CREATE INDEX IF NOT EXISTS idx_auth_trl_expires_at ON auth.token_revocation_list(expires_at);

DO $TRL_TRG$ BEGIN
    CREATE TRIGGER trg_auth_trl_updated_at
        BEFORE UPDATE ON auth.token_revocation_list
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $TRL_TRG$;

COMMENT ON TABLE auth.token_revocation_list IS
    'Lista de JWT revocados. jti = JWT ID único del token.
     expires_at permite limpiar entradas de tokens que ya habrían expirado de todas formas.';

-- ============================================================================
-- PARTE 6: SCHEMA users
-- [v5-3] Perfiles y preferencias. SIN credenciales ni tokens.
-- ============================================================================

-- ── users.organizations (single-tenant: una sola fila) ───────────────────────
-- Se mantiene por compatibilidad con FKs internas del schema.
CREATE TABLE IF NOT EXISTS users.organizations (
    id         UUID         PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::UUID,
    name       VARCHAR(200) NOT NULL DEFAULT 'Mi Empresa',
    slug       VARCHAR(100) NOT NULL DEFAULT 'mi-empresa' UNIQUE,
    timezone   VARCHAR(100) NOT NULL DEFAULT 'America/Bogota',
    language   VARCHAR(10)  NOT NULL DEFAULT 'es',
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    metadata   JSONB        NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $TRG_USERS_ORGS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_users_orgs_updated_at
    BEFORE UPDATE ON users.organizations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_USERS_ORGS_UPDATED_AT_DO$;

COMMENT ON TABLE users.organizations IS
    '[ST] Single-tenant: solo existe UNA fila con id fijo.
     No usar como discriminador de aislamiento multi-tenant.';

-- ── users.profiles ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users.profiles (
    -- id == auth.credentials.user_id (relación lógica, sin FK cross-schema)
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name      VARCHAR(100) NOT NULL,
    last_name       VARCHAR(100) NOT NULL,
    display_email   VARCHAR(255) NULL,
    phone           VARCHAR(30)  NULL,
    avatar_url      TEXT         NULL,
    -- Superadmin global: puede configurar cualquier módulo sin role_id
    is_superadmin   BOOLEAN      NOT NULL DEFAULT false,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    deleted_at      TIMESTAMPTZ  NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_profiles_active
    ON users.profiles(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_profiles_deleted
    ON users.profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_profiles_superadmin
    ON users.profiles(is_superadmin) WHERE is_superadmin = true AND deleted_at IS NULL;

DO $TRG_USERS_PROFILES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_users_profiles_updated_at
    BEFORE UPDATE ON users.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_USERS_PROFILES_UPDATED_AT_DO$;

COMMENT ON TABLE users.profiles IS
    'Perfiles de usuario. id = mismo UUID que auth.credentials.user_id.
     is_superadmin = rol global que supera todos los roles de módulo.
     NO contiene password_hash ni tokens.';

-- ── users.preferences ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users.preferences (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- user_id = FK lógica a users.profiles.id (mismo schema → FK real permitida)
    user_id                 UUID         NOT NULL UNIQUE
                                REFERENCES users.profiles(id) ON DELETE CASCADE,
    language                VARCHAR(10)  NOT NULL DEFAULT 'es',
    timezone                VARCHAR(50)  NOT NULL DEFAULT 'America/Bogota',
    notification_email      BOOLEAN      NOT NULL DEFAULT true,
    notification_whatsapp   BOOLEAN      NOT NULL DEFAULT false,
    notification_in_app     BOOLEAN      NOT NULL DEFAULT true,
    ui_settings             JSONB        NULL,
    deleted_at              TIMESTAMPTZ  NULL,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $TRG_USERS_PREFS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_users_prefs_updated_at
    BEFORE UPDATE ON users.preferences
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_USERS_PREFS_UPDATED_AT_DO$;

-- ============================================================================
-- PARTE 7: SCHEMA config
-- [v5-10] Configuración dinámica y feature flags.
-- ============================================================================

-- ── config.module_settings ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config.module_settings (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- module_id NULL = configuración global del sistema
    module_id      UUID         NULL,
    key            VARCHAR(100) NOT NULL,
    value          TEXT         NOT NULL,
    value_type     VARCHAR(10)  NOT NULL
                       CHECK (value_type IN ('string','int','bool','json')),
    description    TEXT         NULL,
    version        INTEGER      NOT NULL DEFAULT 1,
    is_active      BOOLEAN      NOT NULL DEFAULT true,
    deprecated_at  TIMESTAMPTZ  NULL,
    updated_by     UUID         NULL,    -- FK lógica a users.profiles.id
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, key, version)
);

CREATE INDEX IF NOT EXISTS idx_config_settings_module
    ON config.module_settings(module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_config_settings_key
    ON config.module_settings(key) WHERE is_active = true;

DO $TRG_CONFIG_SETTINGS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_config_settings_updated_at
    BEFORE UPDATE ON config.module_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_CONFIG_SETTINGS_UPDATED_AT_DO$;

COMMENT ON TABLE config.module_settings IS
    'Configuración dinámica por módulo o global (module_id NULL).
     value_type define cómo deserializar value en la aplicación.
     version permite histórico de cambios sin borrar registros anteriores.';

-- ── config.feature_flags ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS config.feature_flags (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- module_id NULL = flag global
    module_id   UUID         NULL,
    flag_key    VARCHAR(100) NOT NULL,
    is_enabled  BOOLEAN      NOT NULL DEFAULT false,
    description TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, flag_key)
);

CREATE INDEX IF NOT EXISTS idx_config_flags_module
    ON config.feature_flags(module_id);

DO $TRG_CONFIG_FLAGS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_config_flags_updated_at
    BEFORE UPDATE ON config.feature_flags
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_CONFIG_FLAGS_UPDATED_AT_DO$;

-- ============================================================================
-- PARTE 8: SCHEMA modules
-- Módulos, ubicaciones, ambientes, categorías, roles.
-- Las FKs a users.profiles son LÓGICAS (cross-schema).
-- Las FKs internas del schema (→ modules.*) son reales.
-- ============================================================================

-- ── modules.modules ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.modules (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(100) NOT NULL,
    slug        VARCHAR(100) NOT NULL UNIQUE,
    description TEXT         NULL,
    -- type: helpdesk | inventory | custom (VARCHAR, no enum — puede extenderse)
    type        VARCHAR(50)  NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    deleted_at  TIMESTAMPTZ  NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_active
    ON modules.modules(is_active) WHERE deleted_at IS NULL;

DO $TRG_MODULES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_modules_updated_at
    BEFORE UPDATE ON modules.modules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_MODULES_UPDATED_AT_DO$;

COMMENT ON TABLE modules.modules IS
    'Registro maestro de módulos creados por el superadmin.
     type es VARCHAR (no enum) para permitir tipos custom sin migración.';

-- ── modules.locations (sedes) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.locations (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id  UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    name       VARCHAR(100) NOT NULL,
    address    TEXT         NULL,
    is_active  BOOLEAN      NOT NULL DEFAULT true,
    deleted_at TIMESTAMPTZ  NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_locations_module
    ON modules.locations(module_id) WHERE deleted_at IS NULL;

DO $TRG_MODULES_LOCATIONS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_modules_locations_updated_at
    BEFORE UPDATE ON modules.locations
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_MODULES_LOCATIONS_UPDATED_AT_DO$;

-- ── modules.environments (ambientes dentro de una sede) ──────────────────────
CREATE TABLE IF NOT EXISTS modules.environments (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID         NOT NULL REFERENCES modules.locations(id) ON DELETE CASCADE,
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    name        VARCHAR(100) NOT NULL,
    description TEXT         NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    deleted_at  TIMESTAMPTZ  NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_environments_location
    ON modules.environments(location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modules_environments_module
    ON modules.environments(module_id) WHERE deleted_at IS NULL;

DO $TRG_MODULES_ENVIRONMENTS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_modules_environments_updated_at
    BEFORE UPDATE ON modules.environments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_MODULES_ENVIRONMENTS_UPDATED_AT_DO$;

COMMENT ON TABLE modules.environments IS
    'Todo ticket y todo activo lleva environment_id.
     La asignación de tickets y activos filtra siempre por environment_id.';

-- ── modules.categories ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.categories (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    -- NULL = categoría raíz
    parent_id   UUID         NULL REFERENCES modules.categories(id) ON DELETE SET NULL,
    name        VARCHAR(100) NOT NULL,
    description TEXT         NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    deleted_at  TIMESTAMPTZ  NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_categories_module_parent
    ON modules.categories(module_id, parent_id) WHERE deleted_at IS NULL;

DO $TRG_MODULES_CATEGORIES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_modules_categories_updated_at
    BEFORE UPDATE ON modules.categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_MODULES_CATEGORIES_UPDATED_AT_DO$;

-- ── modules.module_roles (catálogo de roles por módulo) ──────────────────────
CREATE TABLE IF NOT EXISTS modules.module_roles (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    name        VARCHAR(50)  NOT NULL,
    description TEXT         NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, name)
);

CREATE INDEX IF NOT EXISTS idx_modules_roles_module
    ON modules.module_roles(module_id) WHERE is_active = true;

DO $TRG_MODULES_ROLES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_modules_roles_updated_at
    BEFORE UPDATE ON modules.module_roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_MODULES_ROLES_UPDATED_AT_DO$;

COMMENT ON TABLE modules.module_roles IS
    'Catálogo de roles disponibles por módulo.
     Roles estándar: usuario, tecnico, jefe_tecnico, admin_modulo.
     Nombres de roles son VARCHAR (dinámicos, no enum).';

-- ── modules.user_module_roles (asignación usuario → rol → módulo) ─────────────
CREATE TABLE IF NOT EXISTS modules.user_module_roles (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): users.profiles.id
    user_id     UUID         NOT NULL,
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    role_id     UUID         NOT NULL REFERENCES modules.module_roles(id) ON DELETE RESTRICT,
    -- FK lógica (cross-schema): users.profiles.id del asignador
    assigned_by UUID         NOT NULL,
    assigned_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(user_id, module_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_umr_user_module
    ON modules.user_module_roles(user_id, module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_umr_module_role
    ON modules.user_module_roles(module_id, role_id) WHERE is_active = true;

DO $TRG_UMR_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_umr_updated_at
    BEFORE UPDATE ON modules.user_module_roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_UMR_UPDATED_AT_DO$;

COMMENT ON TABLE modules.user_module_roles IS
    'Un usuario puede pertenecer a múltiples módulos y tener múltiples roles
     dentro del mismo módulo. El superadmin (users.profiles.is_superadmin) supera
     todos los roles de módulo — no necesita fila aquí.';

-- ============================================================================
-- PARTE 9: SCHEMA tickets — Motor FSM y SLA data-driven
-- Orden interno mandatorio del prompt.
-- ============================================================================

-- ── tickets.workflow_versions ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.workflow_versions (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): modules.modules.id
    module_id      UUID         NOT NULL,
    version        INTEGER      NOT NULL,
    description    TEXT         NULL,
    is_active      BOOLEAN      NOT NULL DEFAULT false,
    deprecated_at  TIMESTAMPTZ  NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, version)
);

DO $TRG_WFV_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_wfv_updated_at
    BEFORE UPDATE ON tickets.workflow_versions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_WFV_UPDATED_AT_DO$;

-- ── tickets.states ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.states (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id  UUID         NOT NULL
                             REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE,
    -- FK lógica (cross-schema)
    module_id            UUID         NOT NULL,
    name                 VARCHAR(50)  NOT NULL,
    label                VARCHAR(100) NOT NULL,
    is_initial           BOOLEAN      NOT NULL DEFAULT false,
    is_final             BOOLEAN      NOT NULL DEFAULT false,
    is_active            BOOLEAN      NOT NULL DEFAULT true,
    version              INTEGER      NOT NULL DEFAULT 1,
    deprecated_at        TIMESTAMPTZ  NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_states_wfv
    ON tickets.states(workflow_version_id) WHERE is_active = true;

DO $TRG_STATES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_states_updated_at
    BEFORE UPDATE ON tickets.states
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_STATES_UPDATED_AT_DO$;

-- ── tickets.transitions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.transitions (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id  UUID         NOT NULL
                             REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE,
    module_id            UUID         NOT NULL,
    from_state_id        UUID         NOT NULL REFERENCES tickets.states(id) ON DELETE CASCADE,
    to_state_id          UUID         NOT NULL REFERENCES tickets.states(id) ON DELETE CASCADE,
    name                 VARCHAR(100) NOT NULL,
    is_active            BOOLEAN      NOT NULL DEFAULT true,
    version              INTEGER      NOT NULL DEFAULT 1,
    deprecated_at        TIMESTAMPTZ  NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_transitions_wfv_from
    ON tickets.transitions(workflow_version_id, from_state_id) WHERE is_active = true;

DO $TRG_TRANSITIONS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_transitions_updated_at
    BEFORE UPDATE ON tickets.transitions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TRANSITIONS_UPDATED_AT_DO$;

-- ── tickets.transition_rules ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.transition_rules (
    id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    transition_id        UUID         NOT NULL
                             REFERENCES tickets.transitions(id) ON DELETE CASCADE,
    role_name            VARCHAR(50)  NOT NULL,
    condition_expression TEXT         NULL,
    action_type          public.action_type NOT NULL,
    action_payload       JSONB        NULL,
    created_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_trules_transition
    ON tickets.transition_rules(transition_id);

DO $TRG_TRANSITION_RULES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_transition_rules_updated_at
    BEFORE UPDATE ON tickets.transition_rules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TRANSITION_RULES_UPDATED_AT_DO$;

-- ── tickets.sla_policies ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.sla_policies (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id      UUID         NOT NULL,
    name           VARCHAR(100) NOT NULL,
    description    TEXT         NULL,
    version        INTEGER      NOT NULL DEFAULT 1,
    is_active      BOOLEAN      NOT NULL DEFAULT false,
    deprecated_at  TIMESTAMPTZ  NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_policies_module
    ON tickets.sla_policies(module_id) WHERE is_active = true;

DO $TRG_SLA_POLICIES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_sla_policies_updated_at
    BEFORE UPDATE ON tickets.sla_policies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_SLA_POLICIES_UPDATED_AT_DO$;

-- ── tickets.sla_rules ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.sla_rules (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id             UUID         NOT NULL
                              REFERENCES tickets.sla_policies(id) ON DELETE CASCADE,
    priority_result       public.priority_level NOT NULL,
    resolution_time_hours INTEGER      NOT NULL CHECK (resolution_time_hours > 0),
    rule_order            INTEGER      NOT NULL,
    valid_from            TIMESTAMPTZ  NULL,
    valid_until           TIMESTAMPTZ  NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_rules_policy
    ON tickets.sla_rules(policy_id);

DO $TRG_SLA_RULES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_sla_rules_updated_at
    BEFORE UPDATE ON tickets.sla_rules
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_SLA_RULES_UPDATED_AT_DO$;

-- ── tickets.sla_conditions ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.sla_conditions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id       UUID        NOT NULL
                      REFERENCES tickets.sla_rules(id) ON DELETE CASCADE,
    field         VARCHAR(100) NOT NULL,
    operator      VARCHAR(10)  NOT NULL
                      CHECK (operator IN ('=','!=','>','<','>=','<=','IN')),
    value         TEXT         NOT NULL,
    -- Mismo logical_group = AND entre sí.
    -- Distintos grupos = OR entre grupos.
    logical_group INTEGER      NOT NULL,
    order_index   INTEGER      NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()  -- [FIX-9]
);

DO $SLAC_TRG$ BEGIN
    CREATE TRIGGER trg_sla_conditions_updated_at
        BEFORE UPDATE ON tickets.sla_conditions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $SLAC_TRG$;

-- [ÍNDICE OBLIGATORIO del prompt]
CREATE INDEX IF NOT EXISTS idx_tickets_sla_conditions_rule_group
    ON tickets.sla_conditions(rule_id, logical_group, order_index);

COMMENT ON TABLE tickets.sla_conditions IS
    'Condiciones data-driven para reglas SLA.
     Ejemplo: "Si category_id = X AND environment_id = Y → prioridad alta, 4h"
       cond 1: field=category_id, operator==, value=<uuid>, logical_group=1
       cond 2: field=environment_id, operator==, value=<uuid>, logical_group=1
     logical_group igual = AND entre condiciones del grupo.
     logical_group distinto = OR entre grupos.';

-- ── tickets.tickets (tabla principal, PARTICIONADA, INMUTABLE) ────────────────
-- Particionada por created_at. Sin deleted_at (inmutable según el prompt).
CREATE TABLE IF NOT EXISTS tickets.tickets (
    id                   UUID                   NOT NULL DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema)
    module_id            UUID                   NOT NULL,
    workflow_version_id  UUID                   NOT NULL,
    current_state_id     UUID                   NOT NULL,
    -- FK lógica (cross-schema): modules.environments.id
    environment_id       UUID                   NOT NULL,
    -- FK lógica (cross-schema): modules.categories.id
    category_id          UUID                   NOT NULL,
    -- FK lógica (cross-schema): users.profiles.id
    created_by           UUID                   NOT NULL,
    priority             public.priority_level  NOT NULL DEFAULT 'media',
    urgency              public.urgency_level   NOT NULL DEFAULT 'media',
    impact               public.impact_level    NOT NULL DEFAULT 'medio',
    -- FK lógica (cross-schema): tickets.sla_policies.id
    sla_policy_id        UUID                   NOT NULL,
    sla_deadline         TIMESTAMPTZ            NULL,
    -- reprocess_count: máximo 1 según el prompt
    reprocess_count      INTEGER                NOT NULL DEFAULT 0
                             CHECK (reprocess_count <= 1),
    -- optimistic locking
    version              INTEGER                NOT NULL DEFAULT 1,
    title                VARCHAR(255)           NOT NULL,
    description          TEXT                   NULL,
    created_at           TIMESTAMPTZ            NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ            NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Índices obligatorios del prompt sobre tickets particionados
CREATE INDEX IF NOT EXISTS idx_tickets_module_state
    ON tickets.tickets(module_id, current_state_id);
CREATE INDEX IF NOT EXISTS idx_tickets_module_priority
    ON tickets.tickets(module_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by
    ON tickets.tickets(created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline
    ON tickets.tickets(sla_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_environment
    ON tickets.tickets(environment_id);

COMMENT ON TABLE tickets.tickets IS
    'Tabla principal de tickets. INMUTABLE: sin deleted_at, sin borrado físico.
     Particionada mensualmente por created_at.
     urgency = percepción del usuario / impact = criticidad para el negocio.
     priority = calculado por SLA combinando urgency + impact + condiciones.
     reprocess_count <= 1 por especificación.';

-- [FIX-6] FKs same-schema (permitidas y obligatorias por las reglas).
-- Se aplican vía DO/EXCEPTION para idempotencia y para que NO bloqueen la
-- ejecución cuando el catalogo aún no esté listo en re-runs.
DO $TFK1$ BEGIN
    ALTER TABLE tickets.tickets
        ADD CONSTRAINT fk_tickets_workflow_version
        FOREIGN KEY (workflow_version_id)
        REFERENCES tickets.workflow_versions(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $TFK1$;

DO $TFK2$ BEGIN
    ALTER TABLE tickets.tickets
        ADD CONSTRAINT fk_tickets_current_state
        FOREIGN KEY (current_state_id)
        REFERENCES tickets.states(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $TFK2$;

DO $TFK3$ BEGIN
    ALTER TABLE tickets.tickets
        ADD CONSTRAINT fk_tickets_sla_policy
        FOREIGN KEY (sla_policy_id)
        REFERENCES tickets.sla_policies(id) ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL; END $TFK3$;

-- [FIX-13] LIMITACIÓN TÉCNICA: PostgreSQL no permite UNIQUE INDEX global en
-- una tabla particionada sin incluir la clave de partición. La PK compuesta
-- (id, created_at) ya garantiza unicidad EFECTIVA porque gen_random_uuid()
-- produce UUIDs irrepetibles (colisión probabilidad < 1 en 10^36).
--
-- Para lookups eficientes por id solo (sin partition pruning), creamos un
-- BTREE no-unique. PostgreSQL propagará a cada partición. Las queries por
-- id seguirán siendo eficientes con index scan, aunque tocarán las particiones
-- que no se puedan podar.
CREATE INDEX IF NOT EXISTS idx_tickets_id_lookup
    ON tickets.tickets (id);

-- [v5-12] Trigger version_bump: ANTES de triggers de set_updated_at para que se defina
-- la función primero; el trigger se aplica después de la tabla.
CREATE OR REPLACE FUNCTION tickets.fn_ticket_version_bump()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION tickets.fn_ticket_state_audit()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_state_id IS DISTINCT FROM OLD.current_state_id THEN
        INSERT INTO audit.event_log (
            actor_id, actor_type, action,
            entity_type, entity_id,
            old_value, new_value,
            created_at
        ) VALUES (
            app.get_current_user_id(),
            'user'::public.actor_type,
            'ticket.state_changed',
            'ticket',
            NEW.id,
            jsonb_build_object('state_id', OLD.current_state_id),
            jsonb_build_object('state_id', NEW.current_state_id),
            now()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, tickets, audit, app;

-- [FIX-8] Trigger que GARANTIZA llenado de ticket_state_history en CADA
-- cambio de current_state_id, incluso si la app hace UPDATE directo sin pasar
-- por execute_transition. Captura completa, no opcional.
CREATE OR REPLACE FUNCTION tickets.fn_ticket_state_history()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.current_state_id IS DISTINCT FROM OLD.current_state_id THEN
        INSERT INTO tickets.ticket_state_history (
            ticket_id, from_state_id, to_state_id,
            transitioned_by, transitioned_at
        ) VALUES (
            NEW.id, OLD.current_state_id, NEW.current_state_id,
            COALESCE(app.get_current_user_id(),
                '00000000-0000-0000-0000-000000000001'::UUID),
            now()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, tickets, app;

-- Triggers se crean DESPUÉS de las particiones para propagarse correctamente.
-- Se define aquí para claridad; se aplican en PARTE 20.

-- ── tickets.ticket_assignments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.ticket_assignments (
    id           UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID                   NOT NULL,   -- FK lógica (tabla particionada)
    -- FK lógica (cross-schema): users.profiles.id
    user_id      UUID                   NOT NULL,
    role         public.assignment_role NOT NULL,
    assigned_by  UUID                   NOT NULL,
    assigned_at  TIMESTAMPTZ            NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ           NULL,
    is_active    BOOLEAN                NOT NULL DEFAULT true,
    created_at   TIMESTAMPTZ            NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ            NOT NULL DEFAULT now()
);

-- Índices obligatorios del prompt
CREATE INDEX IF NOT EXISTS idx_ta_ticket_active
    ON tickets.ticket_assignments(ticket_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_active
    ON tickets.ticket_assignments(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_role_active
    ON tickets.ticket_assignments(user_id, role, is_active);
-- [FIX-14] Eliminado idx_ta_user_active_module (redundante con idx_ta_user_active)
-- Se ejecuta DROP por idempotencia en re-runs sobre BD ya inicializada.
DROP INDEX IF EXISTS tickets.idx_ta_user_active_module;

-- [FIX-5] UNIQUE parcial: previene 2 owners activos para el mismo ticket bajo
-- concurrencia. Combinado con advisory locks de FIX-1 garantiza un único owner.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ta_one_active_owner
    ON tickets.ticket_assignments (ticket_id)
    WHERE role = 'owner' AND is_active = true;

DO $TRG_TA_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_ta_updated_at
    BEFORE UPDATE ON tickets.ticket_assignments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TA_UPDATED_AT_DO$;

-- ── tickets.ticket_state_history (INMUTABLE, PARTICIONADA) ───────────────────
-- [FIX-9] created_at + updated_at agregados (tabla inmutable: nunca cambian).
CREATE TABLE IF NOT EXISTS tickets.ticket_state_history (
    id               UUID         NOT NULL DEFAULT gen_random_uuid(),
    ticket_id        UUID         NOT NULL,
    from_state_id    UUID         NOT NULL,
    to_state_id      UUID         NOT NULL,
    -- FK lógica (cross-schema): users.profiles.id
    transitioned_by  UUID         NOT NULL,
    transition_reason TEXT        NULL,
    transitioned_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- [FIX-9]
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- [FIX-9]
    PRIMARY KEY (id, transitioned_at)
) PARTITION BY RANGE (transitioned_at);

CREATE INDEX IF NOT EXISTS idx_tickets_tsh_ticket_id
    ON tickets.ticket_state_history(ticket_id);

COMMENT ON TABLE tickets.ticket_state_history IS
    'Trazabilidad completa e inmutable de cambios de estado. Solo INSERT. Particionada.';

-- ── tickets.ticket_sla_tracking ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.ticket_sla_tracking (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id    UUID         NOT NULL UNIQUE,  -- FK lógica (tabla particionada)
    sla_policy_id UUID        NOT NULL,
    sla_rule_id  UUID         NOT NULL,
    started_at   TIMESTAMPTZ  NOT NULL,
    deadline_at  TIMESTAMPTZ  NOT NULL,
    paused_at    TIMESTAMPTZ  NULL,
    resumed_at   TIMESTAMPTZ  NULL,
    breached_at  TIMESTAMPTZ  NULL,
    status       VARCHAR(20)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','paused','met','breached')),
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_slat_ticket
    ON tickets.ticket_sla_tracking(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_slat_status_deadline
    ON tickets.ticket_sla_tracking(status, deadline_at);

DO $TRG_SLA_TRACKING_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_sla_tracking_updated_at
    BEFORE UPDATE ON tickets.ticket_sla_tracking
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_SLA_TRACKING_UPDATED_AT_DO$;

-- ── tickets.ticket_approvals (INMUTABLE — firma digital) ─────────────────────
CREATE TABLE IF NOT EXISTS tickets.ticket_approvals (
    id             UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      UUID                   NOT NULL,
    -- FK lógica (cross-schema): users.profiles.id
    user_id        UUID                   NOT NULL,
    token          VARCHAR(255)           NOT NULL UNIQUE,
    status         public.approval_status NOT NULL DEFAULT 'pending',
    -- Hash de la firma digital (nunca el valor raw)
    signature_hash TEXT                   NULL,
    ip_address     INET                   NULL,
    user_agent     TEXT                   NULL,
    approved_at    TIMESTAMPTZ            NULL,
    expires_at     TIMESTAMPTZ            NOT NULL,
    created_at     TIMESTAMPTZ            NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ            NOT NULL DEFAULT now()  -- [FIX-9]
);

DO $APPR_TRG$ BEGIN
    CREATE TRIGGER trg_ticket_approvals_updated_at
        BEFORE UPDATE ON tickets.ticket_approvals
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $APPR_TRG$;

-- Índices obligatorios del prompt
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_ticket
    ON tickets.ticket_approvals(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_token
    ON tickets.ticket_approvals(token);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_status_expires
    ON tickets.ticket_approvals(status, expires_at);

COMMENT ON TABLE tickets.ticket_approvals IS
    'Firma digital para cierre de ticket. INMUTABLE.
     Flujo: técnico marca realizado → token generado → usuario notificado →
     aprueba (cerrado+signature_hash) | rechaza (reproceso) | expira (auto_close en 2d).';

-- ── tickets.ticket_comments ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.ticket_comments (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id     UUID         NOT NULL,
    -- FK lógica (cross-schema): users.profiles.id
    user_id       UUID         NOT NULL,
    comment_type  VARCHAR(20)  NOT NULL CHECK (comment_type IN ('internal','public')),
    content       TEXT         NOT NULL,
    attachments   JSONB        NULL,
    deleted_at    TIMESTAMPTZ  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_comments_ticket
    ON tickets.ticket_comments(ticket_id) WHERE deleted_at IS NULL;

DO $TRG_TICKET_COMMENTS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_ticket_comments_updated_at
    BEFORE UPDATE ON tickets.ticket_comments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TICKET_COMMENTS_UPDATED_AT_DO$;

-- ── tickets.technician_availability ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.technician_availability (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): users.profiles.id
    user_id     UUID         NOT NULL,
    module_id   UUID         NOT NULL,
    day_of_week SMALLINT     NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    start_time  TIME         NOT NULL,
    end_time    TIME         NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technician_availability_user_module_day
    ON tickets.technician_availability(user_id, module_id, day_of_week)
    WHERE is_active = true;

DO $TRG_TECH_AVAILABILITY_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_tech_availability_updated_at
    BEFORE UPDATE ON tickets.technician_availability
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TECH_AVAILABILITY_UPDATED_AT_DO$;

-- ── tickets.technician_leaves ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.technician_leaves (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): users.profiles.id
    user_id     UUID         NOT NULL,
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    reason      TEXT         NULL,
    -- FK lógica (cross-schema): users.profiles.id del aprobador
    approved_by UUID         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_technician_leaves_user_dates
    ON tickets.technician_leaves(user_id, start_date, end_date);

DO $TRG_TECH_LEAVES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_tech_leaves_updated_at
    BEFORE UPDATE ON tickets.technician_leaves
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TECH_LEAVES_UPDATED_AT_DO$;

-- ── tickets.technician_category_skills ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.technician_category_skills (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    module_id   UUID         NOT NULL,
    -- FK lógica (cross-schema): modules.categories.id
    category_id UUID         NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(user_id, module_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_cat_skills_user_module_cat
    ON tickets.technician_category_skills(user_id, module_id, category_id)
    WHERE is_active = true;

DO $TRG_TECH_SKILLS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_tech_skills_updated_at
    BEFORE UPDATE ON tickets.technician_category_skills
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TECH_SKILLS_UPDATED_AT_DO$;

-- ── tickets.technician_profiles ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.technician_profiles (
    id                UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID                   NOT NULL,
    module_id         UUID                   NOT NULL,
    technician_type   public.technician_type NOT NULL DEFAULT 'generalist',
    -- NULL = usa el umbral global de assignment_policies
    max_daily_tickets INTEGER                NULL,
    is_active         BOOLEAN                NOT NULL DEFAULT true,
    created_at        TIMESTAMPTZ            NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ            NOT NULL DEFAULT now(),
    UNIQUE(user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_profiles_user_module
    ON tickets.technician_profiles(user_id, module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tech_profiles_module_type
    ON tickets.technician_profiles(module_id, technician_type) WHERE is_active = true;

DO $TRG_TECH_PROFILES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_tech_profiles_updated_at
    BEFORE UPDATE ON tickets.technician_profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TECH_PROFILES_UPDATED_AT_DO$;

COMMENT ON TABLE tickets.technician_profiles IS
    'Perfil de asignación híbrida del técnico.
     generalist: atiende cualquier categoría (red de seguridad).
     specialist: solo categorías definidas en technician_category_skills.
     both: tiene skills pero también acepta cualquier ticket.
     max_daily_tickets NULL → usa assignment_policies.specialist_overflow_threshold.';

-- ── tickets.assignment_policies ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.assignment_policies (
    id                            UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id                     UUID                      NOT NULL UNIQUE,
    use_specialists               BOOLEAN                   NOT NULL DEFAULT true,
    use_generalists               BOOLEAN                   NOT NULL DEFAULT true,
    specialist_overflow_enabled   BOOLEAN                   NOT NULL DEFAULT true,
    specialist_overflow_threshold INTEGER                   NOT NULL DEFAULT 5,
    assignment_method             public.assignment_method  NOT NULL DEFAULT 'round_robin',
    -- FK lógica (cross-schema): users.profiles.id
    updated_by                    UUID                      NULL,
    created_at                    TIMESTAMPTZ               NOT NULL DEFAULT now(),  -- [FIX-9]
    updated_at                    TIMESTAMPTZ               NOT NULL DEFAULT now()
);

DO $APOL_TRG$ BEGIN
    CREATE TRIGGER trg_assignment_policies_updated_at
        BEFORE UPDATE ON tickets.assignment_policies
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $APOL_TRG$;

COMMENT ON TABLE tickets.assignment_policies IS
    'Política de asignación híbrida por módulo.
     Modos configurables desde UI sin cambios de código:
       solo specialists, solo generalists, specialists-primero, specialists-con-overflow.
     specialist_overflow_threshold: N tickets activos antes de saturar un especialista.
     Se ignora si technician_profiles.max_daily_tickets está definido (tiene precedencia).';

-- ── tickets.ticket_assignment_counters ───────────────────────────────────────
-- [FIX-2] UNIQUE migrado a índice con NULLS NOT DISTINCT para que category_id NULL
-- (pool generalista) sea reconocido como duplicado en ON CONFLICT.
-- [FIX-9] Agregado created_at faltante.
CREATE TABLE IF NOT EXISTS tickets.ticket_assignment_counters (
    id                    UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id             UUID                    NOT NULL,
    -- FK lógica (cross-schema): modules.environments.id
    environment_id        UUID                    NOT NULL,
    -- NULL = puntero generalista del módulo/env; UUID = puntero especialista de esa categoría
    category_id           UUID                    NULL,
    technician_type       public.technician_type  NOT NULL DEFAULT 'generalist',
    -- FK lógica (cross-schema): users.profiles.id del último asignado
    last_assigned_user_id UUID                    NULL,
    assignment_count      BIGINT                  NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ             NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- [FIX-2] UNIQUE NULLS NOT DISTINCT (PG 15+): trata NULL como valor "igual a NULL"
-- para que el ON CONFLICT del upsert dispare correctamente cuando category_id IS NULL.
CREATE UNIQUE INDEX IF NOT EXISTS uq_tac_pool
    ON tickets.ticket_assignment_counters
    (module_id, environment_id, category_id, technician_type)
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_tac_module_env
    ON tickets.ticket_assignment_counters(module_id, environment_id);

-- [FIX-9] Trigger updated_at (envuelto en DO por FIX-11)
DO $TAC_TRG$ BEGIN
    CREATE TRIGGER trg_tac_updated_at
        BEFORE UPDATE ON tickets.ticket_assignment_counters
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $TAC_TRG$;

COMMENT ON TABLE tickets.ticket_assignment_counters IS
    'Puntero de round-robin por pool (module+env+category+type).
     category_id NULL = pool generalista del módulo/environment.
     Permite punteros independientes por tipo de pool para round-robin puro.
     Algoritmo completo de 5 pasos en el prompt — la DB lo soporta completamente.';

-- ============================================================================
-- PARTE 10: SCHEMA inventory
-- ============================================================================

-- ── inventory.assets ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory.assets (
    id              UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema)
    module_id       UUID               NOT NULL,
    environment_id  UUID               NOT NULL,
    category_id     UUID               NOT NULL,
    -- Jerarquía de activos (self-reference dentro del mismo schema → FK real)
    parent_asset_id UUID               NULL REFERENCES inventory.assets(id) ON DELETE SET NULL,
    name            VARCHAR(255)       NOT NULL,
    description     TEXT               NULL,
    specifications  JSONB              NULL,
    qr_code         VARCHAR(100)       NOT NULL UNIQUE,
    serial_number   VARCHAR(100)       NULL,
    status          public.asset_status NOT NULL DEFAULT 'disponible',
    -- optimistic locking
    version         INTEGER            NOT NULL DEFAULT 1,
    deleted_at      TIMESTAMPTZ        NULL,
    created_at      TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ        NOT NULL DEFAULT now()
);

-- Índices obligatorios del prompt
CREATE INDEX IF NOT EXISTS idx_inventory_assets_env_status
    ON inventory.assets(environment_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_category
    ON inventory.assets(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_status_active
    ON inventory.assets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_qr
    ON inventory.assets(qr_code);

DO $TRG_ASSETS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_assets_updated_at
    BEFORE UPDATE ON inventory.assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_ASSETS_UPDATED_AT_DO$;

-- [v5-12] Trigger: generar QR automático si es NULL en INSERT
CREATE OR REPLACE FUNCTION inventory.fn_assets_generate_qr()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.qr_code IS NULL OR NEW.qr_code = '' THEN
        NEW.qr_code := 'QR-' || gen_random_uuid()::TEXT;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $TRG_ASSETS_GENERATE_QR_DO$ BEGIN

    CREATE TRIGGER trg_assets_generate_qr
    BEFORE INSERT ON inventory.assets
    FOR EACH ROW EXECUTE FUNCTION inventory.fn_assets_generate_qr();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_ASSETS_GENERATE_QR_DO$;

-- [v5-12] Trigger: incrementar version en UPDATE
CREATE OR REPLACE FUNCTION inventory.fn_asset_version_bump()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $TRG_ASSET_VERSION_BUMP_DO$ BEGIN

    CREATE TRIGGER trg_asset_version_bump
    BEFORE UPDATE ON inventory.assets
    FOR EACH ROW EXECUTE FUNCTION inventory.fn_asset_version_bump();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_ASSET_VERSION_BUMP_DO$;

COMMENT ON TABLE inventory.assets IS
    'Activos físicos. qr_code generado automáticamente si es NULL.
     version para optimistic locking: UPDATE ... WHERE id=$1 AND version=$2.
     parent_asset_id para jerarquías (ej: servidor → tarjeta de red).';

-- ── inventory.asset_relationships ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory.asset_relationships (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_asset_id   UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE CASCADE,
    child_asset_id    UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50)  NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- [FIX-9]
    UNIQUE(parent_asset_id, child_asset_id)
);

DO $AR_TRG$ BEGIN
    CREATE TRIGGER trg_asset_relationships_updated_at
        BEFORE UPDATE ON inventory.asset_relationships
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $AR_TRG$;

CREATE INDEX IF NOT EXISTS idx_inv_ar_parent ON inventory.asset_relationships(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_ar_child  ON inventory.asset_relationships(child_asset_id);

COMMENT ON TABLE inventory.asset_relationships IS
    'relationship_type es VARCHAR (dinámico, no enum): puede ser "contiene", "depende_de", etc.';

-- ── inventory.ticket_assets ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory.ticket_assets (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): tickets.tickets.id
    ticket_id  UUID         NOT NULL,
    asset_id   UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE RESTRICT,
    notes      TEXT         NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- [FIX-9]
    UNIQUE(ticket_id, asset_id)
);

DO $INV_TA_TRG$ BEGIN
    CREATE TRIGGER trg_inv_ticket_assets_updated_at
        BEFORE UPDATE ON inventory.ticket_assets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $INV_TA_TRG$;

CREATE INDEX IF NOT EXISTS idx_inv_ta_ticket ON inventory.ticket_assets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_inv_ta_asset  ON inventory.ticket_assets(asset_id);

-- ── inventory.asset_requests ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory.asset_requests (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     UUID         NOT NULL,
    -- FK lógica (cross-schema): users.profiles.id
    user_id       UUID         NOT NULL,
    category_id   UUID         NOT NULL,
    subcategory_id UUID        NULL,
    description   TEXT         NULL,
    quantity      INTEGER      NOT NULL DEFAULT 1 CHECK (quantity > 0),
    justification TEXT         NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','fulfilled')),
    reviewed_by   UUID         NULL,
    reviewed_at   TIMESTAMPTZ  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_req_user_status
    ON inventory.asset_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_req_module_status
    ON inventory.asset_requests(module_id, status);

DO $TRG_ASSET_REQUESTS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_asset_requests_updated_at
    BEFORE UPDATE ON inventory.asset_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_ASSET_REQUESTS_UPDATED_AT_DO$;

-- ── inventory.asset_assignments ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory.asset_assignments (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id    UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE RESTRICT,
    -- FK lógica (cross-schema): users.profiles.id
    user_id     UUID         NOT NULL,
    assigned_by UUID         NOT NULL,
    -- FK lógica (cross-schema): inventory.asset_requests.id
    request_id  UUID         NULL,
    assigned_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ NULL,
    status      VARCHAR(20)  NOT NULL DEFAULT 'activo'
                    CHECK (status IN ('activo','devuelto','transferido')),
    notes       TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_ass_asset_status
    ON inventory.asset_assignments(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_ass_user_status
    ON inventory.asset_assignments(user_id, status);

DO $TRG_ASSET_ASSIGNMENTS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_asset_assignments_updated_at
    BEFORE UPDATE ON inventory.asset_assignments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_ASSET_ASSIGNMENTS_UPDATED_AT_DO$;

-- ── inventory.asset_assignment_history (INMUTABLE) ────────────────────────────
CREATE TABLE IF NOT EXISTS inventory.asset_assignment_history (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id      UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE RESTRICT,
    -- FK lógica (cross-schema): users.profiles.id
    user_id       UUID         NOT NULL,
    assigned_by   UUID         NOT NULL,
    -- FK lógica: inventory.asset_assignments.id
    assignment_id UUID         NULL,
    action        VARCHAR(30)  NOT NULL
                      CHECK (action IN ('asignado','devuelto','transferido',
                                        'dado_de_baja','reparacion')),
    reason        TEXT         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()  -- [FIX-9] Tabla inmutable: updated_at = created_at siempre
);

CREATE INDEX IF NOT EXISTS idx_inv_aah_asset
    ON inventory.asset_assignment_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_aah_user
    ON inventory.asset_assignment_history(user_id);

COMMENT ON TABLE inventory.asset_assignment_history IS
    'Historial inmutable de movimientos de activos. Solo INSERT, nunca UPDATE/DELETE.';

-- ── inventory.asset_procurement_requests ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory.asset_procurement_requests (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     UUID         NOT NULL,
    requested_by  UUID         NOT NULL,
    category_id   UUID         NOT NULL,
    quantity      INTEGER      NOT NULL CHECK (quantity > 0),
    justification TEXT         NOT NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','approved','rejected','fulfilled')),
    approved_by   UUID         NULL,
    approved_at   TIMESTAMPTZ  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_proc_module_status
    ON inventory.asset_procurement_requests(module_id, status);

DO $TRG_PROCUREMENT_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_procurement_updated_at
    BEFORE UPDATE ON inventory.asset_procurement_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_PROCUREMENT_UPDATED_AT_DO$;

-- ============================================================================
-- PARTE 11: SCHEMA files
-- ============================================================================

CREATE TABLE IF NOT EXISTS files.files (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): users.profiles.id
    uploaded_by    UUID         NOT NULL,
    -- Tipo de entidad propietaria: ticket, asset, user, comment
    entity_type    VARCHAR(50)  NOT NULL,
    entity_id      UUID         NOT NULL,
    file_name      VARCHAR(255) NOT NULL,
    file_size      BIGINT       NOT NULL CHECK (file_size > 0),
    mime_type      VARCHAR(100) NOT NULL,
    storage_url    TEXT         NOT NULL,
    -- false = archivo temporal (aún no confirmado por la app)
    is_confirmed   BOOLEAN      NOT NULL DEFAULT false,
    expires_at     TIMESTAMPTZ  NULL,
    deleted_at     TIMESTAMPTZ  NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_entity
    ON files.files(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by
    ON files.files(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_temporary
    ON files.files(expires_at) WHERE is_confirmed = false AND deleted_at IS NULL;

DO $TRG_FILES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_files_updated_at
    BEFORE UPDATE ON files.files
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_FILES_UPDATED_AT_DO$;

COMMENT ON TABLE files.files IS
    'Archivos del sistema. is_confirmed=false = temporal pendiente de confirmar.
     Los temporales se limpian según expires_at mediante job de mantenimiento.
     entity_type/entity_id: relación polimórfica (validada en aplicación).';

-- ============================================================================
-- PARTE 12: SCHEMA notifications
-- Las notificaciones se generan SIEMPRE mediante events.outbox, nunca directamente.
-- ============================================================================

-- ── notifications.notification_templates ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications.notification_templates (
    id            UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    VARCHAR(100)                  NOT NULL,
    channel       public.notification_channel   NOT NULL,
    subject       VARCHAR(255)                  NULL,
    template_body TEXT                          NOT NULL,
    variables     JSONB                         NOT NULL DEFAULT '[]',
    is_active     BOOLEAN                       NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ                   NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ                   NOT NULL DEFAULT now(),
    UNIQUE(event_type, channel)
);

DO $TRG_NOTIF_TEMPLATES_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_notif_templates_updated_at
    BEFORE UPDATE ON notifications.notification_templates
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_NOTIF_TEMPLATES_UPDATED_AT_DO$;

COMMENT ON TABLE notifications.notification_templates IS
    'Templates de notificación por evento y canal.
     variables: array de nombres de variables disponibles para interpolar en template_body.
     UNIQUE(event_type, channel) garantiza un template por evento y canal.';

-- ── notifications.notification_logs (PARTICIONADA) ───────────────────────────
CREATE TABLE IF NOT EXISTS notifications.notification_logs (
    id             UUID                          NOT NULL DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): users.profiles.id
    user_id        UUID                          NOT NULL,
    -- FK lógica: notifications.notification_templates.id (puede ser NULL si no hay template)
    template_id    UUID                          NULL,
    event_type     VARCHAR(100)                  NOT NULL,
    channel        public.notification_channel   NOT NULL,
    status         public.notification_status    NOT NULL DEFAULT 'pending',
    payload        JSONB                         NOT NULL,
    error_message  TEXT                          NULL,
    sent_at        TIMESTAMPTZ                   NULL,
    created_at     TIMESTAMPTZ                   NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ                   NOT NULL DEFAULT now(),  -- [FIX-9]
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

DO $NL_TRG$ BEGIN
    CREATE TRIGGER trg_notif_logs_updated_at
        BEFORE UPDATE ON notifications.notification_logs
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $NL_TRG$;

-- Índices obligatorios del prompt
CREATE INDEX IF NOT EXISTS idx_notif_logs_user_status
    ON notifications.notification_logs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event_channel
    ON notifications.notification_logs(event_type, channel);

COMMENT ON TABLE notifications.notification_logs IS
    'Log de notificaciones enviadas. Particionado mensualmente.
     status=pending → sent/failed según resultado del envío.';

-- ============================================================================
-- PARTE 13: SCHEMA audit
-- Log central e INMUTABLE. Solo INSERT. Nunca UPDATE ni DELETE.
-- PARTICIONADA por created_at.
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit.event_log (
    id           UUID                  NOT NULL DEFAULT gen_random_uuid(),
    -- FK lógica (cross-schema): users.profiles.id (NULL si actor_type=system/job)
    actor_id     UUID                  NULL,
    actor_type   public.actor_type     NOT NULL,
    action       VARCHAR(100)          NOT NULL,
    entity_type  VARCHAR(50)           NOT NULL,
    entity_id    UUID                  NOT NULL,
    old_value    JSONB                 NULL,
    new_value    JSONB                 NULL,
    ip_address   INET                  NULL,
    user_agent   TEXT                  NULL,
    created_at   TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ           NOT NULL DEFAULT now(),  -- [FIX-9] Tabla inmutable: updated_at = created_at
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Índices obligatorios del prompt
CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON audit.event_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON audit.event_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created_at
    ON audit.event_log(created_at DESC);

COMMENT ON TABLE audit.event_log IS
    'Log central inmutable. Solo INSERT, nunca UPDATE/DELETE.
     actor_type=user → actor_id = users.profiles.id.
     actor_type=system|job → actor_id puede ser NULL.
     Particionada mensualmente por created_at.';

-- ============================================================================
-- PARTE 14: SCHEMA events (outbox pattern)
-- Entrega at-least-once a RabbitMQ en Fase 2.
-- ============================================================================

CREATE TABLE IF NOT EXISTS events.outbox (
    id             UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50)           NOT NULL,
    aggregate_id   UUID                  NOT NULL,
    event_type     VARCHAR(100)          NOT NULL,
    payload        JSONB                 NOT NULL,
    status         public.outbox_status  NOT NULL DEFAULT 'pending',
    retries        SMALLINT              NOT NULL DEFAULT 0,
    last_error     TEXT                  NULL,
    scheduled_at   TIMESTAMPTZ           NOT NULL DEFAULT now(),
    processed_at   TIMESTAMPTZ           NULL,
    created_at     TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ           NOT NULL DEFAULT now()  -- [FIX-9]
);

DO $OUTBOX_TRG_DO$ BEGIN
    CREATE TRIGGER trg_events_outbox_updated_at
        BEFORE UPDATE ON events.outbox
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $OUTBOX_TRG_DO$;

-- Índices obligatorios del prompt
CREATE INDEX IF NOT EXISTS idx_events_outbox_status_scheduled
    ON events.outbox(status, scheduled_at)
    WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_events_outbox_aggregate
    ON events.outbox(aggregate_type, aggregate_id);

COMMENT ON TABLE events.outbox IS
    'Outbox pattern para comunicación eventual hacia RabbitMQ (Fase 2).
     Un worker lee filas pending/failed, publica el evento y actualiza status=processed.
     retries y last_error permiten reintentos con backoff.
     En Fase 1 (monolito) los eventos los consume el mismo proceso.';

-- ============================================================================
-- PARTE 15: TRIGGERS OBLIGATORIOS DEL PROMPT
-- [v5-12] Se aplican aquí, luego de crear todas las tablas.
-- ============================================================================

-- trg_ticket_version_bump y trg_ticket_state_audit se aplican a la tabla
-- particionada; PostgreSQL 15+ propaga triggers a todas las particiones.

DO $TRG_TICKET_VERSION_BUMP_DO$ BEGIN

    CREATE TRIGGER trg_ticket_version_bump
    BEFORE UPDATE ON tickets.tickets
    FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_version_bump();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TICKET_VERSION_BUMP_DO$;

DO $TRG_TICKET_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_ticket_updated_at
    BEFORE UPDATE ON tickets.tickets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TICKET_UPDATED_AT_DO$;

DO $TRG_TICKET_STATE_AUDIT_DO$ BEGIN

    CREATE TRIGGER trg_ticket_state_audit
    AFTER UPDATE OF current_state_id ON tickets.tickets
    FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_audit();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TICKET_STATE_AUDIT_DO$;

-- [FIX-8] Trigger que asegura captura de historia ante cualquier cambio de state.
DO $TRG_TICKET_STATE_HISTORY_DO$ BEGIN
    CREATE TRIGGER trg_ticket_state_history
    AFTER UPDATE OF current_state_id ON tickets.tickets
    FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_history();
EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TICKET_STATE_HISTORY_DO$;

-- ============================================================================
-- PARTE 16: PARTICIONES INICIALES
-- tickets.tickets, tickets.ticket_state_history,
-- audit.event_log, notifications.notification_logs
-- Particiones mensuales: 2026-01 → 2027-12
-- ============================================================================

DO $$
DECLARE
    v_cur    DATE := '2026-01-01'::DATE;
    v_end    DATE := '2028-01-01'::DATE;
    v_next   DATE;
    v_suffix TEXT;
BEGIN
    WHILE v_cur < v_end LOOP
        v_next   := v_cur + INTERVAL '1 month';
        v_suffix := TO_CHAR(v_cur, 'YYYY_MM');

        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS tickets.tickets_%s
             PARTITION OF tickets.tickets
             FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next
        );
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS tickets.ticket_state_history_%s
             PARTITION OF tickets.ticket_state_history
             FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next
        );
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS audit.event_log_%s
             PARTITION OF audit.event_log
             FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next
        );
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS notifications.notification_logs_%s
             PARTITION OF notifications.notification_logs
             FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next
        );

        v_cur := v_next;
    END LOOP;
END;
$$;

-- ============================================================================
-- PARTE 17: SCHEMAS DE SOPORTE (conservados de v4.1 — valor adicional)
-- app.settings, modules.* adicionales, functions de dominio, RLS, reports
-- ============================================================================

-- ── app.settings ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app.settings (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    key         VARCHAR(100) NOT NULL UNIQUE,
    value       JSONB        NOT NULL DEFAULT '{}',
    description TEXT         NULL,
    is_system   BOOLEAN      NOT NULL DEFAULT false,
    updated_by  UUID         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app.settings(key);

DO $TRG_APP_SETTINGS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_app_settings_updated_at
    BEFORE UPDATE ON app.settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_APP_SETTINGS_UPDATED_AT_DO$;

-- ── modules.permissions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.permissions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    description TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),  -- [FIX-9]
    deleted_at  TIMESTAMPTZ  NULL,
    UNIQUE(module_id, name)
);

DO $PERM_TRG$ BEGIN
    CREATE TRIGGER trg_modules_permissions_updated_at
        BEFORE UPDATE ON modules.permissions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $PERM_TRG$;

CREATE INDEX IF NOT EXISTS idx_modules_permissions_module
    ON modules.permissions(module_id) WHERE deleted_at IS NULL;

-- ── modules.role_permissions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.role_permissions (
    role_id       UUID        NOT NULL REFERENCES modules.module_roles(id) ON DELETE CASCADE,
    permission_id UUID        NOT NULL REFERENCES modules.permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),  -- [FIX-9]
    PRIMARY KEY (role_id, permission_id)
);

DO $RP_TRG$ BEGIN
    CREATE TRIGGER trg_role_permissions_updated_at
        BEFORE UPDATE ON modules.role_permissions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $RP_TRG$;

-- ── modules.config (configuración dinámica, complementa config.module_settings) ─
CREATE TABLE IF NOT EXISTS modules.config (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    key         VARCHAR(100) NOT NULL,
    value       JSONB        NOT NULL DEFAULT '{}',
    description TEXT         NULL,
    is_system   BOOLEAN      NOT NULL DEFAULT false,
    updated_by  UUID         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, key)
);

CREATE INDEX IF NOT EXISTS idx_modules_config_module
    ON modules.config(module_id);
CREATE INDEX IF NOT EXISTS idx_modules_config_value
    ON modules.config USING gin(value);

DO $TRG_MODULES_CONFIG_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_modules_config_updated_at
    BEFORE UPDATE ON modules.config
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_MODULES_CONFIG_UPDATED_AT_DO$;

COMMENT ON TABLE modules.config IS
    '[FIX-10] [DEPRECATED en v5.1] Duplica funcionalidad con config.module_settings.
     Conservada por compatibilidad con bootstrap_module y código existente.
     NUEVOS desarrollos deben usar config.module_settings.
     Configuración dinámica avanzada por módulo vía JSONB.
     Claves reservadas (is_system=TRUE): ticket_flow, sla_rules, categories,
     locations, priority_rules, queue_config, notifications.';

-- ── modules.technician_status (disponibilidad real-time) ─────────────────────
CREATE TABLE IF NOT EXISTS modules.technician_status (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    module_id        UUID        NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    is_available     BOOLEAN     NOT NULL DEFAULT true,
    reason           VARCHAR(50) CHECK (reason IN
                         ('vacation','maternity_leave','sick_leave','training','other')),
    unavailable_from TIMESTAMPTZ NULL,
    unavailable_to   TIMESTAMPTZ NULL,
    notes            TEXT        NULL,
    created_by       UUID        NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_status_module
    ON modules.technician_status(module_id) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_tech_status_period
    ON modules.technician_status(unavailable_from, unavailable_to)
    WHERE is_available = false;

DO $TRG_TECH_STATUS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_tech_status_updated_at
    BEFORE UPDATE ON modules.technician_status
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TECH_STATUS_UPDATED_AT_DO$;

-- ── modules.technician_assignment_log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.technician_assignment_log (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL,
    module_id        UUID        NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    ticket_id        UUID        NOT NULL,
    assigned_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by      VARCHAR(50) NOT NULL DEFAULT 'system'
                         CHECK (assigned_by IN ('system','admin','manual')),
    assignment_order INT         NOT NULL DEFAULT 0,
    category_slug    VARCHAR(100) NULL,
    is_active        BOOLEAN     NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),  -- [FIX-9]
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()   -- [FIX-9]
);

DO $TAL_TRG$ BEGIN
    CREATE TRIGGER trg_tech_assign_log_updated_at
        BEFORE UPDATE ON modules.technician_assignment_log
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $TAL_TRG$;

CREATE INDEX IF NOT EXISTS idx_assign_log_user_module
    ON modules.technician_assignment_log(user_id, module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_log_module
    ON modules.technician_assignment_log(module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_log_ticket
    ON modules.technician_assignment_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_assign_log_active
    ON modules.technician_assignment_log(module_id, user_id) WHERE is_active = true;

-- ── modules.assets (activos en contexto modular) ─────────────────────────────
CREATE TABLE IF NOT EXISTS modules.assets (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    asset_type      VARCHAR(50)  NOT NULL DEFAULT 'equipment',
    asset_ref_id    UUID         NULL,
    code            VARCHAR(100) NULL,
    name            VARCHAR(200) NOT NULL,
    description     TEXT         NULL,
    location_slug   VARCHAR(100) NULL,
    status          VARCHAR(50)  NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','maintenance','retired')),
    custom_fields   JSONB        NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ  NULL,
    UNIQUE(module_id, code)
);

CREATE INDEX IF NOT EXISTS idx_mod_assets_module
    ON modules.assets(module_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mod_assets_code
    ON modules.assets USING gin(code gin_trgm_ops);

DO $TRG_MOD_ASSETS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_mod_assets_updated_at
    BEFORE UPDATE ON modules.assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE modules.assets IS
    '[FIX-10] [DEPRECATED en v5.1] Duplica funcionalidad con inventory.assets.
     Conservada por compatibilidad. NUEVOS desarrollos deben usar inventory.assets.';

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_MOD_ASSETS_UPDATED_AT_DO$;

-- ── modules.ticket_assets ─────────────────────────────────────────────────────
-- [FIX-10] [DEPRECATED] modules.ticket_assets duplica funcionalidad con
-- inventory.ticket_assets. Conservada por compatibilidad pero NO debe usarse
-- para nuevos desarrollos. Trigger updated_at agregado por FIX-9.
CREATE TABLE IF NOT EXISTS modules.ticket_assets (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  UUID        NOT NULL,
    asset_id   UUID        NOT NULL REFERENCES modules.assets(id) ON DELETE RESTRICT,
    relation   VARCHAR(50) NOT NULL DEFAULT 'affected'
                   CHECK (relation IN ('affected','replaced','repaired','inspected')),
    notes      TEXT        NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- [FIX-9]
    created_by UUID        NULL
);

DO $MTA_TRG$ BEGIN
    CREATE TRIGGER trg_mod_ticket_assets_updated_at
        BEFORE UPDATE ON modules.ticket_assets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $MTA_TRG$;

CREATE INDEX IF NOT EXISTS idx_mod_ta_ticket ON modules.ticket_assets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_mod_ta_asset  ON modules.ticket_assets(asset_id);

COMMENT ON TABLE modules.ticket_assets IS
    '[FIX-10] [DEPRECATED en v5.1] Duplica funcionalidad con inventory.ticket_assets.
     Conservada por compatibilidad. NUEVOS desarrollos deben usar inventory.ticket_assets.';

-- ── modules.technician_skills ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.technician_skills (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       UUID        NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    user_id         UUID        NOT NULL,
    category_slug   VARCHAR(100) NULL,
    location_slug   VARCHAR(100) NULL,
    service_type    VARCHAR(100) NULL,
    max_concurrent  SMALLINT    NOT NULL DEFAULT 10 CHECK (max_concurrent BETWEEN 1 AND 100),
    priority        SMALLINT    NOT NULL DEFAULT 0,
    is_active       BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ NULL,
    UNIQUE(module_id, user_id, category_slug)
);

CREATE INDEX IF NOT EXISTS idx_tech_skills_module_cat
    ON modules.technician_skills(module_id, category_slug) WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tech_skills_user
    ON modules.technician_skills(user_id, module_id) WHERE is_active = true AND deleted_at IS NULL;

DO $TRG_TECH_SKILLS_UPDATED_AT_DO$ BEGIN

    CREATE TRIGGER trg_tech_skills_updated_at
    BEFORE UPDATE ON modules.technician_skills
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_TECH_SKILLS_UPDATED_AT_DO$;

-- ============================================================================
-- PARTE 18: FUNCIONES DE CONTEXTO ADICIONALES
-- ============================================================================

CREATE OR REPLACE FUNCTION app.get_current_role()
RETURNS TEXT AS $$
DECLARE v_role TEXT;
BEGIN
    BEGIN v_role := current_setting('app.current_role', true);
    EXCEPTION WHEN OTHERS THEN v_role := NULL; END;
    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, app;

CREATE OR REPLACE FUNCTION app.has_module_permission(
    p_permission TEXT,
    p_module_id  UUID DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
    v_module_id UUID;
    v_has       BOOLEAN := false;
BEGIN
    v_module_id := COALESCE(p_module_id, app.get_current_module_id());
    IF v_module_id IS NULL THEN RETURN false; END IF;

    SELECT EXISTS (
        SELECT 1
        FROM   modules.user_module_roles  umr
        JOIN   modules.role_permissions   rp  ON rp.role_id      = umr.role_id
        JOIN   modules.permissions        mp  ON mp.id            = rp.permission_id
        WHERE  umr.user_id   = app.get_current_user_id()
        AND    umr.module_id = v_module_id
        AND    mp.name       = p_permission
        AND    umr.is_active = true
        AND    mp.deleted_at IS NULL
    ) INTO v_has;

    RETURN v_has;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = public, app, modules;

-- [FIX-7] Helper para superadmin: lee users.profiles.is_superadmin en lugar
-- de depender de que la app setee app.current_role = 'admin'.
CREATE OR REPLACE FUNCTION app.is_superadmin()
RETURNS BOOLEAN AS $$
DECLARE
    v_uid UUID;
BEGIN
    v_uid := app.get_current_user_id();
    IF v_uid IS NULL THEN
        RETURN false;
    END IF;
    RETURN EXISTS (
        SELECT 1 FROM users.profiles
        WHERE id            = v_uid
        AND   is_superadmin = true
        AND   deleted_at    IS NULL
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = public, app, users;

COMMENT ON FUNCTION app.is_superadmin IS
    '[FIX-7] Devuelve true si el usuario actual (app.current_user_id) es
     superadmin según users.profiles.is_superadmin. Reemplaza el chequeo
     frágil app.get_current_role()=''admin'' en políticas RLS.';

-- ============================================================================
-- PARTE 19: FUNCIONES DE DOMINIO
-- ============================================================================

-- ── tickets.resolve_sla ──────────────────────────────────────────────────────
-- [FIX-3] Reescrita completa contra el modelo data-driven real
-- (tickets.sla_policies → tickets.sla_rules → tickets.sla_conditions).
-- La función vieja modules.resolve_sla referenciaba modules.sla_policies (tabla
-- inexistente) — se elimina abajo.
--
-- Semántica: para cada regla de la política activa más reciente, evalúa si AL
-- MENOS UN logical_group cumple TODAS sus condiciones. Si la regla no tiene
-- condiciones, matchea por default. Devuelve la regla con menor rule_order.
--
-- TODO (v5.2): la evaluación de condiciones por field/operator/value está
-- delegada a la aplicación; aquí solo retornamos reglas sin condiciones (default
-- rules). Para evaluación completa se requiere EXECUTE dinámico, pendiente.
DROP FUNCTION IF EXISTS modules.resolve_sla(UUID, SMALLINT, VARCHAR, VARCHAR, VARCHAR);

CREATE OR REPLACE FUNCTION tickets.resolve_sla(
    p_module_id      UUID,
    p_category_id    UUID                  DEFAULT NULL,
    p_environment_id UUID                  DEFAULT NULL,
    p_urgency        public.urgency_level  DEFAULT NULL,
    p_impact         public.impact_level   DEFAULT NULL
)
RETURNS TABLE (
    policy_id              UUID,
    rule_id                UUID,
    priority_result        public.priority_level,
    resolution_time_hours  INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH active_policy AS (
        SELECT sp.id
        FROM   tickets.sla_policies sp
        WHERE  sp.module_id     = p_module_id
        AND    sp.is_active     = true
        AND    sp.deprecated_at IS NULL
        ORDER BY sp.version DESC
        LIMIT 1
    ),
    candidate_rules AS (
        SELECT
            sr.id                    AS rule_id,
            sr.policy_id,
            sr.priority_result,
            sr.resolution_time_hours,
            sr.rule_order,
            (SELECT COUNT(*) FROM tickets.sla_conditions sc
             WHERE sc.rule_id = sr.id) AS cond_count
        FROM   tickets.sla_rules sr
        JOIN   active_policy ap ON ap.id = sr.policy_id
        WHERE (sr.valid_from  IS NULL OR sr.valid_from  <= now())
        AND   (sr.valid_until IS NULL OR sr.valid_until >  now())
    )
    SELECT
        cr.policy_id,
        cr.rule_id,
        cr.priority_result,
        cr.resolution_time_hours
    FROM   candidate_rules cr
    -- En esta versión solo se toman reglas sin condiciones (default rules);
    -- la evaluación de condiciones específicas se hace en la aplicación.
    WHERE  cr.cond_count = 0
    ORDER  BY cr.rule_order ASC
    LIMIT  1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = public, tickets;

COMMENT ON FUNCTION tickets.resolve_sla IS
    '[FIX-3] Resuelve la SLA aplicable para un módulo dado. Reemplaza la
     función muerta modules.resolve_sla. Implementación parcial: solo reglas
     sin condiciones (default rules). Evaluación de condiciones específicas
     queda en la aplicación hasta v5.2.';

-- ── tickets.execute_transition ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION tickets.execute_transition(
    p_ticket_id     UUID,
    p_transition_id UUID,
    p_comment       TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_ticket     RECORD;
    v_transition RECORD;
BEGIN
    SELECT t.id, t.current_state_id, t.module_id
    INTO   v_ticket
    FROM   tickets.tickets t
    WHERE  t.id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found');
    END IF;

    SELECT tr.id, tr.to_state_id, tr.name
    INTO   v_transition
    FROM   tickets.transitions tr
    WHERE  tr.id             = p_transition_id
    AND    tr.from_state_id  = v_ticket.current_state_id
    AND    tr.is_active      = true;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition');
    END IF;

    UPDATE tickets.tickets
    SET    current_state_id = v_transition.to_state_id
    WHERE  id = p_ticket_id;

    -- [FIX-8] La inserción en ticket_state_history ahora la hace el trigger
    -- trg_ticket_state_history (AFTER UPDATE OF current_state_id), garantizando
    -- captura aunque la app haga UPDATE directo. Aquí solo dejamos el comentario
    -- como reason si fue provisto.
    -- (insertion eliminada para evitar duplicado)

    IF p_comment IS NOT NULL AND p_comment != '' THEN
        INSERT INTO tickets.ticket_comments (
            ticket_id, user_id, comment_type, content, created_at
        ) VALUES (
            p_ticket_id,
            COALESCE(app.get_current_user_id(),
                '00000000-0000-0000-0000-000000000001'::UUID),
            'internal', p_comment, now()
        );
    END IF;

    INSERT INTO events.outbox (
        aggregate_type, aggregate_id, event_type, payload
    ) VALUES (
        'ticket', p_ticket_id, 'ticket.state_changed',
        jsonb_build_object(
            'ticket_id',      p_ticket_id,
            'from_state_id',  v_ticket.current_state_id,
            'to_state_id',    v_transition.to_state_id,
            'transition_id',  p_transition_id,
            'comment',        p_comment
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'ticket_id', p_ticket_id,
        'new_state_id', v_transition.to_state_id
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, tickets, events, app;

-- ── tickets.assign_ticket_hybrid ─────────────────────────────────────────────
-- [FIX-1] Reescritura completa con round-robin REAL:
--   1. Advisory locks por pool para serializar concurrencia.
--   2. Lee last_assigned_user_id del counter ANTES del SELECT.
--   3. ORDER BY cíclico: técnicos con UUID > last_assigned_user_id van primero.
--   4. Defensa en profundidad: verifica que no exista owner activo antes del INSERT.
CREATE OR REPLACE FUNCTION tickets.assign_ticket_hybrid(p_ticket_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_ticket          RECORD;
    v_policy          RECORD;
    v_selected_tech   UUID;
    v_pool            TEXT;
    v_last_user_id    UUID;
    v_lock_key        TEXT;
BEGIN
    -- PASO 1: contexto del ticket (lock pesimista del ticket)
    SELECT t.id, t.module_id, t.environment_id, t.category_id
    INTO   v_ticket
    FROM   tickets.tickets t
    WHERE  t.id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found');
    END IF;

    -- [FIX-1] Defensa: si ya existe un owner activo (carrera previa), no reasignar.
    IF EXISTS (
        SELECT 1 FROM tickets.ticket_assignments
        WHERE  ticket_id = p_ticket_id AND role = 'owner' AND is_active = true
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_assigned');
    END IF;

    -- PASO 1: política del módulo
    SELECT * INTO v_policy
    FROM   tickets.assignment_policies
    WHERE  module_id = v_ticket.module_id;

    IF NOT FOUND THEN
        v_policy.use_specialists             := false;
        v_policy.use_generalists             := true;
        v_policy.specialist_overflow_enabled := false;
        v_policy.specialist_overflow_threshold := 5;
        v_policy.assignment_method           := 'round_robin';
    END IF;

    -- ────────────────────────────────────────────────────────────────────────
    -- PASO 2-3: Pool A — especialistas
    -- [FIX-1] Advisory lock por pool especialista (module+env+category).
    -- ────────────────────────────────────────────────────────────────────────
    IF v_policy.use_specialists THEN
        v_lock_key := v_ticket.module_id::text || ':' ||
                      v_ticket.environment_id::text || ':' ||
                      COALESCE(v_ticket.category_id::text, 'GEN') || ':specialist';
        PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

        -- Leer last_assigned del counter especialista de ESTA categoría
        SELECT tac.last_assigned_user_id
        INTO   v_last_user_id
        FROM   tickets.ticket_assignment_counters tac
        WHERE  tac.module_id      = v_ticket.module_id
        AND    tac.environment_id = v_ticket.environment_id
        AND    tac.category_id    = v_ticket.category_id
        AND    tac.technician_type = 'specialist';

        SELECT tp.user_id
        INTO   v_selected_tech
        FROM   tickets.technician_profiles tp
        JOIN   tickets.technician_category_skills tcs
            ON tcs.user_id     = tp.user_id
            AND tcs.module_id  = tp.module_id
            AND tcs.category_id = v_ticket.category_id
            AND tcs.is_active  = true
        JOIN   modules.user_module_roles umr
            ON umr.user_id     = tp.user_id
            AND umr.module_id  = tp.module_id
            AND umr.is_active  = true
        JOIN   modules.module_roles mr
            ON mr.id = umr.role_id AND mr.name = 'tecnico'
        WHERE  tp.module_id        = v_ticket.module_id
        AND    tp.technician_type IN ('specialist','both')
        AND    tp.is_active        = true
        AND    NOT EXISTS (
            SELECT 1 FROM tickets.technician_leaves tl
            WHERE tl.user_id = tp.user_id
            AND   CURRENT_DATE BETWEEN tl.start_date AND tl.end_date
        )
        AND    NOT EXISTS (
            SELECT 1 FROM modules.technician_status ts
            WHERE ts.user_id      = tp.user_id
            AND   ts.module_id    = tp.module_id
            AND   ts.is_available = false
            AND   (ts.unavailable_to IS NULL OR ts.unavailable_to > now())
        )
        AND (
            NOT v_policy.specialist_overflow_enabled
            OR (
                SELECT COUNT(*)
                FROM   tickets.ticket_assignments ta
                WHERE  ta.user_id   = tp.user_id
                AND    DATE(ta.assigned_at) = CURRENT_DATE
                AND    ta.is_active = true
            ) < COALESCE(tp.max_daily_tickets, v_policy.specialist_overflow_threshold)
        )
        ORDER BY
            -- least_load: técnico con menos tickets activos primero
            CASE WHEN v_policy.assignment_method = 'least_load' THEN
                (SELECT COUNT(*) FROM tickets.ticket_assignments ta2
                 WHERE ta2.user_id = tp.user_id AND ta2.is_active = true)
            ELSE 0 END ASC,
            -- [FIX-1] Round-robin cíclico: primero técnicos con UUID > last_assigned
            CASE
                WHEN v_last_user_id IS NULL THEN 0
                WHEN tp.user_id > v_last_user_id THEN 0
                ELSE 1
            END ASC,
            tp.user_id ASC
        LIMIT 1;

        IF v_selected_tech IS NOT NULL THEN
            v_pool := 'specialist';
        END IF;
    END IF;

    -- ────────────────────────────────────────────────────────────────────────
    -- PASO 3: overflow → Pool B — generalistas
    -- [FIX-1] Advisory lock independiente por pool generalista (module+env).
    -- ────────────────────────────────────────────────────────────────────────
    IF v_selected_tech IS NULL AND v_policy.use_generalists THEN
        v_lock_key := v_ticket.module_id::text || ':' ||
                      v_ticket.environment_id::text || ':GEN:generalist';
        PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

        -- Leer last_assigned del counter generalista (category_id IS NULL)
        SELECT tac.last_assigned_user_id
        INTO   v_last_user_id
        FROM   tickets.ticket_assignment_counters tac
        WHERE  tac.module_id      = v_ticket.module_id
        AND    tac.environment_id = v_ticket.environment_id
        AND    tac.category_id    IS NULL
        AND    tac.technician_type = 'generalist';

        SELECT tp.user_id
        INTO   v_selected_tech
        FROM   tickets.technician_profiles tp
        JOIN   modules.user_module_roles umr
            ON umr.user_id    = tp.user_id
            AND umr.module_id = tp.module_id
            AND umr.is_active = true
        JOIN   modules.module_roles mr
            ON mr.id = umr.role_id AND mr.name IN ('tecnico','jefe_tecnico')
        WHERE  tp.module_id        = v_ticket.module_id
        AND    tp.technician_type IN ('generalist','both')
        AND    tp.is_active        = true
        AND    NOT EXISTS (
            SELECT 1 FROM tickets.technician_leaves tl
            WHERE tl.user_id = tp.user_id
            AND   CURRENT_DATE BETWEEN tl.start_date AND tl.end_date
        )
        AND    NOT EXISTS (
            SELECT 1 FROM modules.technician_status ts
            WHERE ts.user_id      = tp.user_id
            AND   ts.module_id    = tp.module_id
            AND   ts.is_available = false
            AND   (ts.unavailable_to IS NULL OR ts.unavailable_to > now())
        )
        ORDER BY
            CASE WHEN v_policy.assignment_method = 'least_load' THEN
                (SELECT COUNT(*) FROM tickets.ticket_assignments ta2
                 WHERE ta2.user_id = tp.user_id AND ta2.is_active = true)
            ELSE 0 END ASC,
            -- [FIX-1] Round-robin cíclico
            CASE
                WHEN v_last_user_id IS NULL THEN 0
                WHEN tp.user_id > v_last_user_id THEN 0
                ELSE 1
            END ASC,
            tp.user_id ASC
        LIMIT 1;

        IF v_selected_tech IS NOT NULL THEN
            v_pool := 'generalist';
        END IF;
    END IF;

    -- PASO 4: escalamiento total
    IF v_selected_tech IS NULL THEN
        INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('ticket', p_ticket_id, 'ticket.assignment_failed',
                jsonb_build_object('ticket_id', p_ticket_id,
                                   'module_id', v_ticket.module_id));
        RETURN jsonb_build_object('ok', false, 'error', 'no_technician_available');
    END IF;

    -- PASO 5: confirmar asignación
    INSERT INTO tickets.ticket_assignments (
        ticket_id, user_id, role, assigned_by, assigned_at, is_active
    ) VALUES (
        p_ticket_id, v_selected_tech, 'owner',
        '00000000-0000-0000-0000-000000000001'::UUID,
        now(), true
    );

    -- [FIX-2] Counter usa UNIQUE NULLS NOT DISTINCT, por lo que ON CONFLICT
    -- ahora dispara correctamente cuando category_id IS NULL.
    INSERT INTO tickets.ticket_assignment_counters AS tac
        (module_id, environment_id, category_id, technician_type,
         last_assigned_user_id, assignment_count, updated_at)
    VALUES (
        v_ticket.module_id, v_ticket.environment_id,
        CASE WHEN v_pool = 'specialist' THEN v_ticket.category_id ELSE NULL END,
        CASE WHEN v_pool = 'specialist' THEN 'specialist'::public.technician_type
             ELSE 'generalist'::public.technician_type END,
        v_selected_tech, 1, now()
    )
    ON CONFLICT (module_id, environment_id, category_id, technician_type)
    DO UPDATE SET
        last_assigned_user_id = EXCLUDED.last_assigned_user_id,
        assignment_count      = tac.assignment_count + 1,
        updated_at            = now();

    INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('ticket', p_ticket_id, 'ticket.assigned',
            jsonb_build_object(
                'ticket_id',      p_ticket_id,
                'assigned_to',    v_selected_tech,
                'module_id',      v_ticket.module_id,
                'environment_id', v_ticket.environment_id,
                'pool_used',      v_pool
            ));

    RETURN jsonb_build_object(
        'ok',          true,
        'ticket_id',   p_ticket_id,
        'assigned_to', v_selected_tech,
        'pool_used',   v_pool
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, tickets, modules, events, app;

COMMENT ON FUNCTION tickets.assign_ticket_hybrid IS
    '[FIX-1] Algoritmo de asignación híbrida de 5 pasos del prompt CON
     round-robin REAL:
     - pg_advisory_xact_lock por pool (module+env+category+type) para serializar.
     - Lectura de last_assigned_user_id del counter ANTES del SELECT.
     - ORDER BY cíclico: técnicos con UUID > last_assigned van primero.
     - Defensa en profundidad: aborta si ya hay owner activo.
     Pasos: (1) política del módulo (2) Pool A specialists (3) Pool B
     generalistas si Pool A vacío o saturado (4) escalamiento total
     (5) INSERT atómico en assignments + upsert counter + outbox event.';

-- ── tickets.generate_approval_token ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION tickets.generate_approval_token(
    p_ticket_id UUID,
    p_user_id   UUID,
    p_hours     INTEGER DEFAULT 48
)
RETURNS UUID AS $$
DECLARE
    v_approval_id UUID;
    v_token       VARCHAR(255);
BEGIN
    v_token := encode(gen_random_bytes(32), 'hex');

    INSERT INTO tickets.ticket_approvals (
        ticket_id, user_id, token, status, expires_at
    ) VALUES (
        p_ticket_id, p_user_id, v_token, 'pending',
        now() + (p_hours || ' hours')::INTERVAL
    )
    RETURNING id INTO v_approval_id;

    INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('ticket', p_ticket_id, 'ticket.approval_requested',
            jsonb_build_object(
                'ticket_id',   p_ticket_id,
                'user_id',     p_user_id,
                'approval_id', v_approval_id,
                'expires_at',  now() + (p_hours || ' hours')::INTERVAL
            ));

    RETURN v_approval_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, tickets, events;

COMMENT ON FUNCTION tickets.generate_approval_token IS
    'Genera token de aprobación de cierre (firma digital).
     Flujo: técnico realiza ticket → llamar esta función → usuario recibe notificación.
     Expira en p_hours horas (default 48h = 2 días según el prompt).
     Job de mantenimiento cierra tickets con approvals expired y reprocess_count >= 1.';

-- ── maintenance.create_future_partitions ─────────────────────────────────────
CREATE OR REPLACE FUNCTION maintenance.create_future_partitions(
    p_months_ahead INT DEFAULT 6
)
RETURNS TEXT AS $$
DECLARE
    v_start  DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    v_end    DATE := DATE_TRUNC('month',
                        CURRENT_DATE + (p_months_ahead || ' months')::INTERVAL);
    v_cur    DATE := v_start;
    v_next   DATE;
    v_suffix TEXT;
    v_iters  INT  := 0;
BEGIN
    WHILE v_cur < v_end LOOP
        v_next   := v_cur + INTERVAL '1 month';
        v_suffix := TO_CHAR(v_cur, 'YYYY_MM');

        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS tickets.tickets_%s
             PARTITION OF tickets.tickets FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next);
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS tickets.ticket_state_history_%s
             PARTITION OF tickets.ticket_state_history FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next);
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS audit.event_log_%s
             PARTITION OF audit.event_log FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next);
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS notifications.notification_logs_%s
             PARTITION OF notifications.notification_logs FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next);

        v_iters := v_iters + 1;
        v_cur   := v_next;
    END LOOP;

    RETURN FORMAT('Particiones creadas/verificadas: %s meses.', v_iters);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── modules.bootstrap_module ──────────────────────────────────────────────────
-- Crea un módulo completo de forma atómica.
CREATE OR REPLACE FUNCTION modules.bootstrap_module(
    p_organization_id UUID,
    p_name            TEXT,
    p_slug            TEXT,
    p_description     TEXT    DEFAULT NULL,
    p_is_default      BOOLEAN DEFAULT false,
    p_created_by      UUID    DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
    v_module_id   UUID;
    v_role_user   UUID;
    v_role_tech   UUID;
    v_role_chief  UUID;
    v_role_admin  UUID;
    v_wfv_id      UUID;
    v_st_open     UUID;
    v_st_process  UUID;
    v_st_wait     UUID;
    v_st_done     UUID;
    v_st_closed   UUID;
    v_st_reprocess UUID;
BEGIN
    -- 1. Módulo
    INSERT INTO modules.modules (name, slug, description, type, is_active)
    VALUES (p_name, p_slug, p_description, 'helpdesk', true)
    RETURNING id INTO v_module_id;

    -- 2. Roles estándar
    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'usuario',      'Crea y sigue sus tickets',         true) RETURNING id INTO v_role_user;
    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'tecnico',      'Atiende tickets del módulo',       true) RETURNING id INTO v_role_tech;
    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'jefe_tecnico', 'Atiende tickets críticos/reproceso', true) RETURNING id INTO v_role_chief;
    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'admin_modulo', 'Configuración del módulo',         true) RETURNING id INTO v_role_admin;

    -- 3. Workflow FSM inicial
    INSERT INTO tickets.workflow_versions (module_id, version, description, is_active)
    VALUES (v_module_id, 1, 'Workflow estándar v1', true)
    RETURNING id INTO v_wfv_id;

    -- 4. Estados del FSM
    INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
    VALUES (v_wfv_id, v_module_id, 'abierto',    'Abierto',       true,  false) RETURNING id INTO v_st_open;
    INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
    VALUES (v_wfv_id, v_module_id, 'en_proceso', 'En proceso',    false, false) RETURNING id INTO v_st_process;
    INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
    VALUES (v_wfv_id, v_module_id, 'en_espera',  'En espera',     false, false) RETURNING id INTO v_st_wait;
    INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
    VALUES (v_wfv_id, v_module_id, 'realizado',  'Realizado',     false, false) RETURNING id INTO v_st_done;
    INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
    VALUES (v_wfv_id, v_module_id, 'reproceso',  'Reproceso',     false, false) RETURNING id INTO v_st_reprocess;
    INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
    VALUES (v_wfv_id, v_module_id, 'cerrado',    'Cerrado',       false, true)  RETURNING id INTO v_st_closed;

    -- 5. Transiciones FSM
    INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
    VALUES (v_wfv_id, v_module_id, v_st_open,     v_st_process,   'Tomar ticket');
    INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
    VALUES (v_wfv_id, v_module_id, v_st_process,  v_st_wait,      'Solicitar información');
    INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
    VALUES (v_wfv_id, v_module_id, v_st_process,  v_st_done,      'Marcar realizado');
    INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
    VALUES (v_wfv_id, v_module_id, v_st_wait,     v_st_process,   'Reanudar');
    INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
    VALUES (v_wfv_id, v_module_id, v_st_done,     v_st_closed,    'Aprobar y cerrar');
    INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
    VALUES (v_wfv_id, v_module_id, v_st_done,     v_st_reprocess, 'Rechazar solución');
    INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
    VALUES (v_wfv_id, v_module_id, v_st_reprocess, v_st_process,  'Retomar para reproceso');

    -- 6. Política de asignación por defecto
    INSERT INTO tickets.assignment_policies
        (module_id, use_specialists, use_generalists,
         specialist_overflow_enabled, specialist_overflow_threshold,
         assignment_method)
    VALUES (v_module_id, true, true, true, 5, 'round_robin');

    -- 7. Configuración dinámica
    INSERT INTO modules.config (module_id, key, value, is_system) VALUES
    (v_module_id, 'ticket_flow', jsonb_build_object(
        'reproceso_max', 1,
        'auto_close_hours', 48,
        'digital_signature_required', true,
        'allow_user_create', true
    ), true),
    (v_module_id, 'queue_config', jsonb_build_object(
        'max_tickets_per_technician', 10,
        'priority_order', jsonb_build_array('critica','alta','media','baja'),
        'day_split', true
    ), true);

    RETURN jsonb_build_object(
        'ok',          true,
        'module_id',   v_module_id,
        'module_slug', p_slug,
        'workflow_version_id', v_wfv_id,
        'roles', jsonb_build_object(
            'usuario', v_role_user, 'tecnico', v_role_tech,
            'jefe_tecnico', v_role_chief, 'admin_modulo', v_role_admin
        ),
        'message', 'Módulo ' || p_name || ' creado exitosamente.'
    );

EXCEPTION WHEN OTHERS THEN
    -- [FIX-8] Re-raise para rollback atómico completo.
    RAISE EXCEPTION '[bootstrap_module] Fallo al crear módulo "%": % — SQLSTATE: %',
        p_name, SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, modules, tickets, app;

COMMENT ON FUNCTION modules.bootstrap_module IS
    'Crea un módulo completo de forma atómica: módulo, 4 roles, workflow FSM
     con 6 estados y 7 transiciones, política de asignación y configuración base.
     En caso de fallo lanza EXCEPTION para rollback completo (sin datos huérfanos).';

-- ============================================================================
-- PARTE 20: VISTAS OPERACIONALES
-- ============================================================================

-- ── modules.v_available_technicians ──────────────────────────────────────────
CREATE OR REPLACE VIEW modules.v_available_technicians AS
WITH tech_load AS (
    SELECT
        ta.user_id,
        ta.ticket_id,
        -- Obtener module_id del ticket vía JOIN separado por ser tabla particionada
        t.module_id,
        COUNT(*)::INT AS active_count
    FROM   tickets.ticket_assignments ta
    JOIN   tickets.tickets t ON t.id = ta.ticket_id
    WHERE  ta.is_active = true
    GROUP BY ta.user_id, ta.ticket_id, t.module_id
),
tech_load_agg AS (
    SELECT user_id, module_id, SUM(active_count)::INT AS active_tickets
    FROM   tech_load
    GROUP BY user_id, module_id
),
last_assign AS (
    SELECT user_id, module_id, MAX(assigned_at) AS last_assigned_at
    FROM   modules.technician_assignment_log
    GROUP BY user_id, module_id
)
SELECT
    umr.user_id,
    umr.module_id,
    mr.name                                       AS role_name,
    p.first_name || ' ' || p.last_name           AS full_name,
    COALESCE(ts.is_available, true)               AS is_available,
    ts.reason                                     AS unavailable_reason,
    ts.unavailable_to,
    COALESCE(tla.active_tickets, 0)               AS active_tickets,
    la.last_assigned_at,
    ROW_NUMBER() OVER (
        PARTITION BY umr.module_id
        ORDER BY
            COALESCE(tla.active_tickets, 0) ASC,
            la.last_assigned_at            ASC NULLS FIRST
    )                                             AS round_robin_position
FROM   modules.user_module_roles  umr
JOIN   modules.module_roles       mr  ON mr.id        = umr.role_id
JOIN   users.profiles             p   ON p.id         = umr.user_id
LEFT JOIN modules.technician_status ts
    ON ts.user_id    = umr.user_id AND ts.module_id = umr.module_id
LEFT JOIN tech_load_agg tla
    ON tla.user_id   = umr.user_id AND tla.module_id = umr.module_id
LEFT JOIN last_assign la
    ON la.user_id    = umr.user_id AND la.module_id  = umr.module_id
WHERE  umr.is_active = true
AND    p.is_active   = true
AND    p.deleted_at  IS NULL
AND    mr.name IN ('tecnico','jefe_tecnico','admin_modulo')
AND    (
    ts.id IS NULL
    OR ts.is_available = true
    OR (ts.is_available = false
        AND ts.unavailable_to IS NOT NULL
        AND ts.unavailable_to < now())
);

COMMENT ON VIEW modules.v_available_technicians IS
    'Técnicos disponibles con posición round_robin_position.
     round_robin_position=1 → próximo en recibir asignación.
     Reescrita con CTEs (no subconsultas duplicadas en OVER) — ver FIX-9 original.';

-- ── tickets.v_tickets_unified ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW tickets.v_tickets_unified AS
SELECT
    t.id,
    t.module_id,
    m.name                                   AS module_name,
    m.slug                                   AS module_slug,
    t.environment_id,
    t.category_id,
    cat.name                                 AS category_name,
    t.created_by,
    p_creator.first_name || ' ' || p_creator.last_name AS created_by_name,
    t.priority,
    t.urgency,
    t.impact,
    t.current_state_id,
    st.name                                  AS current_state_name,
    st.label                                 AS current_state_label,
    t.sla_policy_id,
    t.sla_deadline,
    t.reprocess_count,
    t.version,
    t.title,
    t.description,
    t.created_at,
    t.updated_at,
    -- Técnico(s) asignado(s) — owner activo
    ta_owner.user_id                         AS assigned_to,
    p_tech.first_name || ' ' || p_tech.last_name AS assigned_to_name,
    -- SLA tracking
    sla_track.status                         AS sla_status,
    sla_track.deadline_at                    AS sla_deadline_at,
    sla_track.breached_at                    AS sla_breached_at,
    -- Tiempo restante en horas
    CASE
        WHEN sla_track.deadline_at IS NOT NULL AND sla_track.breached_at IS NULL
        THEN EXTRACT(EPOCH FROM (sla_track.deadline_at - now())) / 3600.0
        ELSE NULL
    END                                      AS sla_remaining_hours,
    -- Aprobación activa
    appr.status                              AS approval_status,
    appr.expires_at                          AS approval_expires_at,
    CASE DATE(t.created_at) WHEN CURRENT_DATE THEN 'today' ELSE 'previous' END
                                             AS queue_group
FROM        tickets.tickets              t
LEFT JOIN   modules.modules              m         ON m.id       = t.module_id
LEFT JOIN   modules.categories           cat       ON cat.id     = t.category_id
LEFT JOIN   tickets.states               st        ON st.id      = t.current_state_id
LEFT JOIN   users.profiles               p_creator ON p_creator.id = t.created_by
LEFT JOIN   tickets.ticket_assignments   ta_owner
    ON  ta_owner.ticket_id = t.id
    AND ta_owner.role = 'owner'
    AND ta_owner.is_active = true
LEFT JOIN   users.profiles               p_tech    ON p_tech.id  = ta_owner.user_id
LEFT JOIN   tickets.ticket_sla_tracking  sla_track ON sla_track.ticket_id = t.id
LEFT JOIN   tickets.ticket_approvals     appr
    ON  appr.ticket_id = t.id
    AND appr.status    = 'pending';

-- ============================================================================
-- PARTE 21: ROW LEVEL SECURITY
-- [ST] En single-tenant el RLS controla acceso por ROL/MÓDULO,
-- no por aislamiento de organización.
-- ============================================================================

-- ── modules.modules ───────────────────────────────────────────────────────────
ALTER TABLE modules.modules ENABLE ROW LEVEL SECURITY;

-- [FIX-11] Idempotencia de policies: CREATE POLICY no soporta IF NOT EXISTS,
-- usamos DROP POLICY IF EXISTS antes de cada creación.
DROP POLICY IF EXISTS policy_modules_select ON modules.modules;
CREATE POLICY policy_modules_select ON modules.modules AS PERMISSIVE FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            (app.is_superadmin() OR app.get_current_role() = 'admin')
            OR EXISTS (
                SELECT 1 FROM modules.user_module_roles umr
                WHERE umr.module_id  = modules.modules.id
                AND   umr.user_id    = app.get_current_user_id()
                AND   umr.is_active  = true
            )
        )
    );

DROP POLICY IF EXISTS policy_modules_insert ON modules.modules;
CREATE POLICY policy_modules_insert ON modules.modules FOR INSERT
    WITH CHECK ((app.is_superadmin() OR app.get_current_role() = 'admin'));

DROP POLICY IF EXISTS policy_modules_update ON modules.modules;
CREATE POLICY policy_modules_update ON modules.modules FOR UPDATE
    USING ((app.is_superadmin() OR app.get_current_role() = 'admin')
           OR app.has_module_permission('module.config', modules.modules.id))
    WITH CHECK (true);

DROP POLICY IF EXISTS policy_modules_delete ON modules.modules;
CREATE POLICY policy_modules_delete ON modules.modules FOR DELETE
    USING ((app.is_superadmin() OR app.get_current_role() = 'admin'));

-- ── tickets.tickets ───────────────────────────────────────────────────────────
ALTER TABLE tickets.tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_tickets_select ON tickets.tickets;
CREATE POLICY policy_tickets_select ON tickets.tickets AS PERMISSIVE FOR SELECT
    USING (
        (app.is_superadmin() OR app.get_current_role() = 'admin')
        OR created_by = app.get_current_user_id()
        OR EXISTS (
            SELECT 1 FROM tickets.ticket_assignments ta
            WHERE ta.ticket_id = tickets.tickets.id
            AND   ta.user_id   = app.get_current_user_id()
            AND   ta.is_active = true
        )
        OR app.has_module_permission('tickets.view_all', module_id)
    );

DROP POLICY IF EXISTS policy_tickets_insert ON tickets.tickets;
CREATE POLICY policy_tickets_insert ON tickets.tickets FOR INSERT
    WITH CHECK (
        created_by = app.get_current_user_id()
        AND app.has_module_permission('tickets.create', module_id)
    );

DROP POLICY IF EXISTS policy_tickets_update ON tickets.tickets;
CREATE POLICY policy_tickets_update ON tickets.tickets FOR UPDATE
    USING (
        (app.is_superadmin() OR app.get_current_role() = 'admin')
        OR created_by = app.get_current_user_id()
        OR EXISTS (
            SELECT 1 FROM tickets.ticket_assignments ta
            WHERE ta.ticket_id = tickets.tickets.id
            AND   ta.user_id   = app.get_current_user_id()
            AND   ta.is_active = true
        )
        OR app.has_module_permission('tickets.transition', module_id)
    )
    WITH CHECK (true);

-- ── modules.assets ─────────────────────────────────────────────────────────────
ALTER TABLE modules.assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS policy_mod_assets_select ON modules.assets;
CREATE POLICY policy_mod_assets_select ON modules.assets AS PERMISSIVE FOR SELECT
    USING (
        deleted_at IS NULL
        AND (
            (app.is_superadmin() OR app.get_current_role() = 'admin')
            OR app.has_module_permission('inventory.view', module_id)
        )
    );

DROP POLICY IF EXISTS policy_mod_assets_insert ON modules.assets;
CREATE POLICY policy_mod_assets_insert ON modules.assets FOR INSERT
    WITH CHECK (
        (app.is_superadmin() OR app.get_current_role() = 'admin')
        OR app.has_module_permission('inventory.edit', module_id)
    );

DROP POLICY IF EXISTS policy_mod_assets_update ON modules.assets;
CREATE POLICY policy_mod_assets_update ON modules.assets FOR UPDATE
    USING (
        deleted_at IS NULL
        AND (
            (app.is_superadmin() OR app.get_current_role() = 'admin')
            OR app.has_module_permission('inventory.edit', module_id)
        )
    )
    WITH CHECK (true);

-- ============================================================================
-- PARTE 22: TRIGGERS DE AUDITORÍA
-- ============================================================================

CREATE OR REPLACE FUNCTION audit.log_entity_changes()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO audit.event_log (
        actor_id, actor_type, action,
        entity_type, entity_id,
        old_value, new_value, created_at
    ) VALUES (
        app.get_current_user_id(),
        'user'::public.actor_type,
        TG_OP,
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        CASE TG_OP WHEN 'DELETE' THEN (OLD).id ELSE (NEW).id END,
        CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
        CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
        now()
    );
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = public, audit, app;

DO $TRG_AUDIT_MODULES_DO$ BEGIN

    CREATE TRIGGER trg_audit_modules
    AFTER INSERT OR UPDATE OR DELETE ON modules.modules
    FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_AUDIT_MODULES_DO$;

DO $TRG_AUDIT_MODULE_ROLES_DO$ BEGIN

    CREATE TRIGGER trg_audit_module_roles
    AFTER INSERT OR UPDATE OR DELETE ON modules.module_roles
    FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_AUDIT_MODULE_ROLES_DO$;

DO $TRG_AUDIT_INVENTORY_ASSETS_DO$ BEGIN

    CREATE TRIGGER trg_audit_inventory_assets
    AFTER INSERT OR UPDATE OR DELETE ON inventory.assets
    FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

EXCEPTION WHEN duplicate_object THEN NULL; END $TRG_AUDIT_INVENTORY_ASSETS_DO$;

-- [FIX-12] Auditoría ampliada a tablas críticas.
-- NOTA: modules.role_permissions tiene PK compuesta (no columna `id`); no se
-- puede usar el trigger genérico audit.log_entity_changes con (NEW).id, así
-- que se omite (alternativa: trigger especializado, fuera de alcance v5.1).
DO $AUD_TA_DO$ BEGIN
    CREATE TRIGGER trg_audit_ticket_assignments
        AFTER INSERT OR UPDATE OR DELETE ON tickets.ticket_assignments
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $AUD_TA_DO$;

DO $AUD_AP_DO$ BEGIN
    CREATE TRIGGER trg_audit_assignment_policies
        AFTER INSERT OR UPDATE OR DELETE ON tickets.assignment_policies
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $AUD_AP_DO$;

DO $AUD_CR_DO$ BEGIN
    CREATE TRIGGER trg_audit_auth_credentials
        AFTER INSERT OR UPDATE OR DELETE ON auth.credentials
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $AUD_CR_DO$;

DO $AUD_PR_DO$ BEGIN
    CREATE TRIGGER trg_audit_users_profiles
        AFTER INSERT OR UPDATE OR DELETE ON users.profiles
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $AUD_PR_DO$;

DO $AUD_SP_DO$ BEGIN
    CREATE TRIGGER trg_audit_sla_policies
        AFTER INSERT OR UPDATE OR DELETE ON tickets.sla_policies
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $AUD_SP_DO$;

DO $AUD_SR_DO$ BEGIN
    CREATE TRIGGER trg_audit_sla_rules
        AFTER INSERT OR UPDATE OR DELETE ON tickets.sla_rules
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $AUD_SR_DO$;

DO $AUD_UMR_DO$ BEGIN
    CREATE TRIGGER trg_audit_user_module_roles
        AFTER INSERT OR UPDATE OR DELETE ON modules.user_module_roles
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $AUD_UMR_DO$;

-- ============================================================================
-- PARTE 23: VISTAS MATERIALIZADAS DE REPORTES
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS reports;

DROP MATERIALIZED VIEW IF EXISTS reports.technician_load;
CREATE MATERIALIZED VIEW reports.technician_load AS
SELECT
    ta.user_id,
    t.module_id,
    p.first_name || ' ' || p.last_name  AS full_name,
    COUNT(*)                             AS active_tickets,
    COUNT(*) FILTER (WHERE t.priority = 'critica') AS critical_count,
    COUNT(*) FILTER (WHERE t.priority = 'alta')    AS high_count,
    now()                                AS refreshed_at
FROM   tickets.ticket_assignments ta
JOIN   tickets.tickets t
    ON t.id = ta.ticket_id
JOIN   users.profiles p
    ON p.id = ta.user_id
JOIN   tickets.states st
    ON st.id = t.current_state_id AND st.is_final = false
WHERE  ta.is_active = true
AND    ta.role      = 'owner'
GROUP BY ta.user_id, t.module_id, p.first_name, p.last_name
WITH NO DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_tech_load_unique
    ON reports.technician_load(user_id, module_id);

CREATE OR REPLACE FUNCTION reports.refresh_all()
RETURNS TEXT AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY reports.technician_load;
    RETURN 'Vistas materializadas actualizadas: ' || now()::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- PARTE 24: DATOS INICIALES (SEEDS)
-- ============================================================================

-- Organización única (single-tenant)
INSERT INTO users.organizations (id, name, slug, timezone, language)
VALUES ('00000000-0000-0000-0000-000000000001',
        'Mi Empresa', 'mi-empresa', 'America/Bogota', 'es')
ON CONFLICT (id) DO NOTHING;

-- Usuario superadmin por defecto
INSERT INTO users.profiles (id, first_name, last_name, is_superadmin, is_active)
VALUES ('00000000-0000-0000-0000-000000000001',
        'Admin', 'Sistema', true, true)
ON CONFLICT (id) DO NOTHING;

-- Preferencias del superadmin
INSERT INTO users.preferences (user_id, language, timezone)
VALUES ('00000000-0000-0000-0000-000000000001', 'es', 'America/Bogota')
ON CONFLICT (user_id) DO NOTHING;

-- Configuración global del sistema
INSERT INTO app.settings (key, value, description, is_system) VALUES
    ('company_info', jsonb_build_object(
        'name', 'Mi Empresa',
        'timezone', 'America/Bogota',
        'language', 'es',
        'support_email', 'soporte@miempresa.com'
    ), 'Información de la empresa', true),
    ('auth_config', jsonb_build_object(
        'allow_local_auth', true,
        'session_duration_hours', 8,
        'require_email_verification', false
    ), 'Configuración de autenticación', true),
    ('notification_defaults', jsonb_build_object(
        'channels', jsonb_build_array('in_app','email'),
        'email_from', 'noreply@miempresa.com',
        'whatsapp_enabled', false
    ), 'Configuración de notificaciones', true)
ON CONFLICT (key) DO NOTHING;

-- Feature flags globales iniciales
INSERT INTO config.feature_flags (module_id, flag_key, is_enabled, description) VALUES
    (NULL, 'digital_signature_enabled', true,  'Firma digital en cierre de tickets'),
    (NULL, 'whatsapp_notifications',    false, 'Notificaciones por WhatsApp'),
    (NULL, 'inventory_module_enabled',  true,  'Módulo de inventario activo')
ON CONFLICT (module_id, flag_key) DO NOTHING;

-- Módulo Helpdesk por defecto
DO $$
DECLARE v_result JSONB;
BEGIN
    v_result := modules.bootstrap_module(
        '00000000-0000-0000-0000-000000000001'::UUID,
        'Helpdesk', 'helpdesk',
        'Módulo de mesa de ayuda técnica',
        true,
        '00000000-0000-0000-0000-000000000001'::UUID
    );
    RAISE NOTICE 'Helpdesk: %', v_result->>'message';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'bootstrap_module Helpdesk omitido (ya existe o error): %', SQLERRM;
END;
$$;

-- Módulo Inventario
DO $$
DECLARE v_result JSONB;
BEGIN
    v_result := modules.bootstrap_module(
        '00000000-0000-0000-0000-000000000001'::UUID,
        'Inventario', 'inventario',
        'Gestión de activos físicos',
        false,
        '00000000-0000-0000-0000-000000000001'::UUID
    );
    RAISE NOTICE 'Inventario: %', v_result->>'message';
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'bootstrap_module Inventario omitido (ya existe o error): %', SQLERRM;
END;
$$;

-- ============================================================================
-- PARTE 25: COMENTARIOS FINALES DE SCHEMAS
-- ============================================================================

COMMENT ON SCHEMA auth IS
    '[v5] Autenticación propia. credentials, refresh_tokens, sessions, token_revocation_list.
     Sin FK cross-schema: user_id es UUID lógico → users.profiles.id.';

COMMENT ON SCHEMA users IS
    '[v5] Perfiles y preferencias. SIN credenciales ni tokens.
     profiles.id == auth.credentials.user_id (relación lógica).
     is_superadmin = rol global que supera todos los roles de módulo.';

COMMENT ON SCHEMA config IS
    '[v5] Configuración dinámica (module_settings) y feature flags.
     module_id NULL = ámbito global. Complementa modules.config (JSONB).';

COMMENT ON SCHEMA modules IS
    '[v5] Módulos, ubicaciones, ambientes, categorías, roles, permisos.
     FK cross-schema PROHIBIDAS: user_id es UUID lógico.
     FK internas (mismo schema): normales.';

COMMENT ON SCHEMA tickets IS
    '[v5] Ciclo de vida completo del ticket.
     FSM configurable por módulo (workflow_versions → states → transitions → transition_rules).
     SLA data-driven (sla_policies → sla_rules → sla_conditions).
     Asignación híbrida (technician_profiles → assignment_policies → counters).
     tickets INMUTABLE: sin deleted_at. Particionado mensualmente.';

COMMENT ON SCHEMA inventory IS
    '[v5] Activos físicos y su ciclo de vida.
     qr_code generado automáticamente. version para optimistic locking.
     asset_assignment_history INMUTABLE.';

COMMENT ON SCHEMA events IS
    '[v5] Outbox pattern. At-least-once delivery a RabbitMQ en Fase 2.
     En Fase 1 consumido por el mismo proceso.';

COMMENT ON SCHEMA audit IS
    '[v5] Log central INMUTABLE. Solo INSERT. Particionado mensualmente.
     Reemplaza audit.domain_events de v4 para la parte de auditoría interna.';

-- ============================================================================
-- [FIX-4] JOBS pg_cron (OPCIONAL — descomenta si pg_cron está disponible)
-- Migrado de /* */ a comentarios de línea porque '*/15' rompe el comment block.
-- ============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- -- Crear particiones futuras cada domingo 02:00
-- SELECT cron.schedule('create-future-partitions', '0 2 * * 0',
--     'SELECT maintenance.create_future_partitions(6)');
--
-- -- Refresh vistas materializadas diario 03:00
-- SELECT cron.schedule('refresh-reports', '0 3 * * *',
--     'SELECT reports.refresh_all()');
--
-- -- Limpiar archivos temporales vencidos cada hora
-- SELECT cron.schedule('cleanup-temp-files', '0 * * * *',
--     'UPDATE files.files SET deleted_at = now()
--      WHERE is_confirmed = false AND expires_at < now() AND deleted_at IS NULL');
--
-- -- Marcar approvals expirados cada 15 minutos
-- SELECT cron.schedule('process-expired-approvals', '*/15 * * * *',
--     'UPDATE tickets.ticket_approvals
--      SET status = ''expired''
--      WHERE status = ''pending'' AND expires_at < now()');

-- ============================================================================
-- FIN DEL SCRIPT — v5.0 SINGLE-TENANT
-- ============================================================================
