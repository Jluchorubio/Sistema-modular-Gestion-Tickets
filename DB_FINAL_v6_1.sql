-- ============================================================================
-- SISTEMA MODULAR DE GESTIÓN DE TICKETS — v6.1 SINGLE-TENANT
-- PostgreSQL 15+ | Generado: 2026-04-30 | Actualizado: 2026-05-06
-- ============================================================================
-- CHANGELOG v6.1-patch-1 (2026-05-06 — integrado desde DB_PATCH_2.sql)
-- ============================================================================
-- ADD-1  : config.global_roles — catálogo de roles globales (PARTE 7.5).
--          Roles: usuario, tecnico, supervisor, admin. Idempotente (ON CONFLICT).
-- ADD-2  : users.profiles.global_role_id UUID NULL FK → config.global_roles.id.
--          FK añadida post-creación de profiles vía ALTER TABLE (orden PG).
--          Todos los usuarios nuevos sin rol explícito reciben 'usuario' por defecto.
--          Superadmins reciben 'admin' en seeds.
-- ADD-3  : modules.modules.image_url TEXT NULL — URL de imagen del módulo.
-- ============================================================================
-- CHANGELOG v6.0 (10 fixes from architectural audit)
-- ============================================================================
-- FIX-1  : tickets.evaluate_sla_condition() — nueva función IMMUTABLE para
--          evaluación de condiciones SLA sin EXECUTE (injection-safe).
--          tickets.resolve_sla() reescrita completamente: evalúa logical_groups
--          con bool_and(...) sobre JSONB context. Reemplaza la implementación
--          parcial de v5 que solo retornaba default rules.
-- FIX-2  : Triggers de validación cross-schema: app.validate_user_exists()
--          verifica user_id en users.profiles ANTES de INSERT/UPDATE en
--          modules.user_module_roles y tickets.ticket_assignments.
-- FIX-3  : Comentario FIX-13 actualizado: diseño intencional documentado con
--          justificación probabilística (UUID4, p_colisión < 1 en 10^36).
-- FIX-4  : assign_ticket_hybrid: INSERT en ticket_assignments usa
--          ON CONFLICT DO NOTHING + RETURNING para detectar carrera concurrente
--          sin depender solo de la comprobación previa.
-- FIX-5  : Todas las funciones SECURITY DEFINER usan
--          SET search_path = pg_catalog, public, <schemas>
--          (previene hijacking vía search_path injection).
-- FIX-6  : tickets.technician_leaves: CONSTRAINT EXCLUDE USING GIST con
--          daterange para impedir solapamiento de ausencias por técnico.
-- FIX-7  : Columna updated_at ELIMINADA de tablas inmutables:
--          tickets.ticket_state_history, inventory.asset_assignment_history,
--          audit.event_log. Inmutable = solo INSERT, updated_at no tiene sentido.
-- FIX-8  : app.settings marcada SYSTEM-LEVEL BOOTSTRAP ONLY.
--          Seeds migrados de app.settings → config.module_settings.
--          modules.bootstrap_module usa config.module_settings en lugar de
--          modules.config (ya DEPRECATED).
-- FIX-9  : Dos tablas nuevas particionadas:
--          tickets.ticket_comments → RANGE (created_at) mensual, PK (id, created_at)
--          tickets.ticket_assignments → HASH (ticket_id) 8 cubos, PK (id, ticket_id)
--          (HASH en ticket_id garantiza que todas las asignaciones de un ticket
--           vayan al mismo cubo → uq_ta_one_active_owner sigue siendo efectiva)
-- FIX-10 : modules.v_available_technicians: CTE tech_load corregida.
--          Bug: GROUP BY ta.user_id, ta.ticket_id, t.module_id producía
--          active_count=1 siempre → ahora agrupa directamente por user_id,
--          module_id eliminando el paso intermedio redundante.
-- ============================================================================
-- CHANGELOG v6.1 (11 fixes from production audit — VERSIÓN FINAL DEPLOYABLE)
-- ============================================================================
-- BUG-1  : app.validate_user_exists() IMPLEMENTADA (era vaporware en v6.0:
--          documentada en COMMENT ON TABLE pero función y triggers no existían).
--          Triggers trg_umr_validate_user_exists, trg_umr_validate_assigned_by,
--          trg_ta_validate_user_exists, trg_ta_validate_assigned_by creados en
--          PARTE 24.5 (post-seeds). Enforza FK lógica cross-schema hacia
--          users.profiles.id sin violar regla FK cross-schema prohibida.
-- BUG-2  : config.module_settings: UNIQUE(module_id, key, version) inline
--          reemplazada por índice explícito con NULLS NOT DISTINCT (PG15+).
--          Sin esto, ON CONFLICT no disparaba con module_id=NULL → duplicados.
--          Mismo patrón de v6.0 en ticket_assignment_counters (uq_tac_pool).
-- ISSUE-1: evaluate_sla_condition: casts numéricos envueltos en EXCEPTION
--          WHEN invalid_text_representation → devuelve false en vez de abortar
--          transacción cuando field no es numérico y operator es >, <, >=, <=.
--          Operador IN acepta tanto 'values' (array JSONB) como 'value' (CSV).
-- ISSUE-2: resolve_sla pasa value (TEXT) a evaluate_sla_condition. Evaluador
--          usa fallback CSV para IN cuando 'values' ausente. Documentado en
--          COMMENT ON COLUMN tickets.sla_conditions.value.
-- ISSUE-3: assign_ticket_hybrid: 'already_assigned' y 'concurrent_assignment_race'
--          enriquecidos con campo 'detail' para distinguir semánticamente
--          asignación previa exitosa vs carrera concurrente activa.
-- ISSUE-4: auth.refresh_tokens.token_hash: UNIQUE constraint añadida.
--          Sin unicidad: colisión de hash o reutilización de token revocado posible.
-- ISSUE-5: HARD-NULL documentado: tickets.tickets.category_id e
--          inventory.assets.environment_id son NOT NULL desde v6. El pool
--          generalista usa category_id NULL solo en ticket_assignment_counters
--          como puntero round-robin, NO en los tickets ni activos.
-- ISSUE-6: tickets.fn_validate_ticket_coherence(): trigger BEFORE INSERT en
--          tickets.tickets — verifica coherencia mutua de module_id,
--          current_state_id y workflow_version_id. Previene tickets con state
--          de módulo distinto.
-- ISSUE-7: modules.bootstrap_module ahora idempotente: UPSERT en modules y
--          module_roles; guard IF NOT EXISTS para workflow/states/transitions
--          (no re-crea FSM si ya existe — evita ruptura de FKs de tickets vivos).
-- MINOR-1: Verificado: ningún INSERT escribe updated_at en tablas inmutables
--          (audit.event_log, ticket_state_history, asset_assignment_history).
-- MINOR-2: Archivo separado tests_v6_1.sql con 14 tests de regresión.
-- ============================================================================
-- INSTRUCCIONES:
--   1. Ejecutar en PostgreSQL 15+ VACÍA
--   2. Rol con CREATE SCHEMA + CREATE TABLE + CREATE FUNCTION + CREATE EXTENSION
--   3. Script idempotente: IF NOT EXISTS / DO $$ EXCEPTION en todas las creaciones
-- ============================================================================

-- ============================================================================
-- PARTE 0: EXTENSIONES
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- FIX-6: requerido para EXCLUDE USING GIST con daterange

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
-- Solo para valores que NUNCA cambiarán en producción.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE public.priority_level AS ENUM ('baja','media','alta','critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.urgency_level AS ENUM ('baja','media','alta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.impact_level AS ENUM ('bajo','medio','alto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.ticket_status_enum AS ENUM
        ('abierto','en_espera','en_proceso','realizado','cerrado','reproceso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.asset_status AS ENUM
        ('disponible','asignado','en_reparacion','dado_de_baja');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.assignment_role AS ENUM ('owner','collaborator','observer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.technician_type AS ENUM ('generalist','specialist','both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.assignment_method AS ENUM ('round_robin','least_load','hybrid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.approval_status AS ENUM ('pending','approved','rejected','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.notification_channel AS ENUM ('email','whatsapp','in_app');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.notification_status AS ENUM ('pending','sent','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.outbox_status AS ENUM ('pending','processing','processed','failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.action_type AS ENUM
        ('notify_user','escalate_ticket','change_priority',
         'reassign_technician','auto_close');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE public.actor_type AS ENUM ('user','system','job');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 3: FUNCIÓN COMPARTIDA set_updated_at
-- Debe existir ANTES que cualquier tabla que la use en triggers.
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
-- [FIX-5] search_path incluye pg_catalog para prevenir hijacking.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.get_current_user_id()
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, app;

CREATE OR REPLACE FUNCTION app.get_current_organization_id()
RETURNS UUID AS $$
BEGIN
    -- SINGLE-TENANT: UUID fijo. No es discriminador de aislamiento.
    RETURN '00000000-0000-0000-0000-000000000001'::UUID;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, app;

CREATE OR REPLACE FUNCTION app.get_current_module_id()
RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_module_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, app;

-- ============================================================================
-- PARTE 5: SCHEMA auth
-- Autenticación propia. FK cross-schema PROHIBIDAS: user_id es UUID lógico.
-- ============================================================================

CREATE TABLE IF NOT EXISTS auth.credentials (
    id                     UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID         NOT NULL UNIQUE,
    email                  VARCHAR(255) NOT NULL UNIQUE,
    password_hash          TEXT         NOT NULL,
    is_active              BOOLEAN      NOT NULL DEFAULT true,
    last_login_at          TIMESTAMPTZ  NULL,
    failed_login_attempts  INTEGER      NOT NULL DEFAULT 0,   -- intentos fallidos de contraseña
    login_locked_until     TIMESTAMPTZ  NULL,                 -- bloqueo temporal (OTP o contraseña)
    created_at             TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_credentials_email   ON auth.credentials(email);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_user_id ON auth.credentials(user_id);

DO $$ BEGIN
    CREATE TRIGGER trg_auth_credentials_updated_at
        BEFORE UPDATE ON auth.credentials
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE auth.credentials IS
    'Credenciales de autenticación. user_id es FK lógica a users.profiles.id.
     Nunca almacenar password en texto plano — siempre password_hash (bcrypt/argon2).';

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    token_hash  TEXT         NOT NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    revoked_at  TIMESTAMPTZ  NULL,
    ip_address  INET         NULL,
    user_agent  TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_rt_user_id    ON auth.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_rt_token_hash ON auth.refresh_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_rt_expires    ON auth.refresh_tokens(expires_at)
    WHERE revoked_at IS NULL;

-- [ISSUE-4] token_hash debe ser único: previene colisión de hash y reutilización de token revocado.
DO $$ BEGIN
    ALTER TABLE auth.refresh_tokens
        ADD CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_auth_rt_updated_at
        BEFORE UPDATE ON auth.refresh_tokens
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE auth.refresh_tokens IS
    'Tokens de refresco JWT. token_hash = SHA-256 del token raw.
     Nunca almacenar el token en texto plano.';

CREATE TABLE IF NOT EXISTS auth.sessions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    ip_address  INET         NULL,
    user_agent  TEXT         NULL,
    expires_at  TIMESTAMPTZ  NOT NULL,
    ended_at    TIMESTAMPTZ  NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth.sessions(expires_at)
    WHERE ended_at IS NULL;

DO $$ BEGIN
    CREATE TRIGGER trg_auth_sessions_updated_at
        BEFORE UPDATE ON auth.sessions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS auth.token_revocation_list (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    jti        UUID         NOT NULL UNIQUE,
    user_id    UUID         NOT NULL,
    revoked_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    reason     VARCHAR(100) NULL,
    expires_at TIMESTAMPTZ  NOT NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_trl_jti        ON auth.token_revocation_list(jti);
CREATE INDEX IF NOT EXISTS idx_auth_trl_expires_at ON auth.token_revocation_list(expires_at);

DO $$ BEGIN
    CREATE TRIGGER trg_auth_trl_updated_at
        BEFORE UPDATE ON auth.token_revocation_list
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE auth.token_revocation_list IS
    'Lista de JWT revocados. jti = JWT ID único del token.
     expires_at permite limpiar entradas de tokens que ya habrían expirado.';

-- ── MFA settings ────────────────────────────────────────────────────────────
-- TOTP (Google Authenticator) + Email OTP (Resend). Intervalo 17.5 días.

CREATE TABLE IF NOT EXISTS auth.mfa_settings (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                     UUID        NOT NULL UNIQUE,
    totp_secret                 TEXT        NULL,
    totp_enabled                BOOLEAN     NOT NULL DEFAULT false,
    totp_last_verified_at       TIMESTAMPTZ NULL,
    email_otp_enabled           BOOLEAN     NOT NULL DEFAULT false,
    email_otp_last_verified_at  TIMESTAMPTZ NULL,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auth_mfa_user_id ON auth.mfa_settings(user_id);

COMMENT ON TABLE auth.mfa_settings IS
    'Configuración MFA por usuario. TOTP (speakeasy) y Email OTP (Resend).
     Intervalo de re-verificación: 17.5 días.';

-- ── Password resets ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.password_resets (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    token_hash  TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pw_reset_lookup
    ON auth.password_resets(token_hash) WHERE used_at IS NULL;

COMMENT ON TABLE auth.password_resets IS
    'Tokens de recuperación de contraseña. token_hash = SHA-256 del token raw. TTL 1h.';

-- ── Email OTP codes ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.email_otp (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL,
    code_hash   TEXT        NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_email_otp_lookup
    ON auth.email_otp(user_id, expires_at) WHERE used_at IS NULL;

COMMENT ON TABLE auth.email_otp IS
    'Códigos OTP enviados por email (Resend). code_hash = SHA-256 del código de 6 dígitos. TTL 10 min.';

-- ============================================================================
-- PARTE 6: SCHEMA users
-- Perfiles y preferencias. SIN credenciales ni tokens.
-- ============================================================================

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

DO $$ BEGIN
    CREATE TRIGGER trg_users_orgs_updated_at
        BEFORE UPDATE ON users.organizations
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE users.organizations IS
    '[ST] Single-tenant: solo existe UNA fila con id fijo.
     No usar como discriminador de aislamiento multi-tenant.';

CREATE TABLE IF NOT EXISTS users.profiles (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    first_name       VARCHAR(100) NOT NULL,
    last_name        VARCHAR(100) NOT NULL,
    username         VARCHAR(100) NULL,       -- login alternativo (email OR username)
    display_email    VARCHAR(255) NULL,
    phone            VARCHAR(30)  NULL,
    avatar_url       TEXT         NULL,
    address          TEXT         NULL,       -- dirección de residencia
    job_title        VARCHAR(150) NULL,       -- cargo
    department       VARCHAR(150) NULL,       -- área/departamento
    primary_sede     VARCHAR(200) NULL,       -- sede principal
    profile_complete BOOLEAN      NOT NULL DEFAULT false,  -- perfil obligatorio completo
    is_superadmin    BOOLEAN      NOT NULL DEFAULT false,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    deleted_at       TIMESTAMPTZ  NULL,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    global_role_id   UUID         NULL        -- FK: REFERENCES config.global_roles(id) — añadida vía ALTER TABLE en PARTE 7.5
);

CREATE INDEX IF NOT EXISTS idx_users_profiles_active
    ON users.profiles(is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_profiles_deleted
    ON users.profiles(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_profiles_superadmin
    ON users.profiles(is_superadmin) WHERE is_superadmin = true AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username
    ON users.profiles(username) WHERE username IS NOT NULL AND deleted_at IS NULL;

DO $$ BEGIN
    CREATE TRIGGER trg_users_profiles_updated_at
        BEFORE UPDATE ON users.profiles
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE users.profiles IS
    'Perfiles de usuario. id = mismo UUID que auth.credentials.user_id.
     is_superadmin = flag de acceso total (supera todos los roles de módulo).
     global_role_id = rol visual global (FK → config.global_roles, añadida en PARTE 7.5).
     NO contiene password_hash ni tokens.';

CREATE TABLE IF NOT EXISTS users.preferences (
    id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id               UUID         NOT NULL UNIQUE
                              REFERENCES users.profiles(id) ON DELETE CASCADE,
    language              VARCHAR(10)  NOT NULL DEFAULT 'es',
    timezone              VARCHAR(50)  NOT NULL DEFAULT 'America/Bogota',
    notification_email    BOOLEAN      NOT NULL DEFAULT true,
    notification_whatsapp BOOLEAN      NOT NULL DEFAULT false,
    notification_in_app   BOOLEAN      NOT NULL DEFAULT true,
    ui_settings           JSONB        NULL,
    deleted_at            TIMESTAMPTZ  NULL,
    created_at            TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ  NOT NULL DEFAULT now()
);

DO $$ BEGIN
    CREATE TRIGGER trg_users_prefs_updated_at
        BEFORE UPDATE ON users.preferences
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 7: SCHEMA config
-- Configuración dinámica y feature flags — fuente de verdad única.
-- ============================================================================

CREATE TABLE IF NOT EXISTS config.module_settings (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     UUID         NULL,
    key           VARCHAR(100) NOT NULL,
    value         TEXT         NOT NULL,
    value_type    VARCHAR(10)  NOT NULL
                      CHECK (value_type IN ('string','int','bool','json')),
    description   TEXT         NULL,
    version       INTEGER      NOT NULL DEFAULT 1,
    is_active     BOOLEAN      NOT NULL DEFAULT true,
    deprecated_at TIMESTAMPTZ  NULL,
    updated_by    UUID         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
    -- [BUG-2] Inline UNIQUE removida — reemplazada por uq_cms_scope con NULLS NOT DISTINCT
);

CREATE INDEX IF NOT EXISTS idx_config_settings_module
    ON config.module_settings(module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_config_settings_key
    ON config.module_settings(key) WHERE is_active = true;

-- [BUG-2] NULLS NOT DISTINCT (PG15+): trata module_id NULL como igual para ON CONFLICT.
-- Sin esto, dos globals (module_id=NULL, misma key+version) no colisionaban → duplicados.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cms_scope
    ON config.module_settings (module_id, key, version)
    NULLS NOT DISTINCT;

DO $$ BEGIN
    CREATE TRIGGER trg_config_settings_updated_at
        BEFORE UPDATE ON config.module_settings
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE config.module_settings IS
    '[FIX-8] Fuente de verdad única para configuración dinámica por módulo o
     global (module_id NULL). value_type define cómo deserializar value.
     version permite histórico sin borrar registros anteriores.
     NUEVOS desarrollos deben usar esta tabla — NO app.settings ni modules.config.';

CREATE TABLE IF NOT EXISTS config.feature_flags (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
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

DO $$ BEGIN
    CREATE TRIGGER trg_config_flags_updated_at
        BEFORE UPDATE ON config.feature_flags
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 7.5: config.global_roles — Catálogo de roles globales del sistema
-- Roles transversales a todos los módulos. Asignados a users.profiles.
-- La FK users.profiles.global_role_id → config.global_roles.id se añade aquí
-- porque config.global_roles se define después de users.profiles (orden PG).
-- ============================================================================

CREATE TABLE IF NOT EXISTS config.global_roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT        NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$ BEGIN
    CREATE TRIGGER trg_config_global_roles_updated_at
        BEFORE UPDATE ON config.global_roles
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE config.global_roles IS
    'Catálogo de roles globales del sistema (ej: usuario, tecnico, supervisor, admin).
     Asignado a users.profiles.global_role_id. Diferente de modules.module_roles
     (roles por módulo). El campo is_superadmin en profiles sigue siendo el flag
     de acceso total — global_role es solo para UI y clasificación.';

-- FK lógica users.profiles → config.global_roles
-- Se añade aquí porque config.global_roles se crea después de users.profiles
DO $$ BEGIN
    ALTER TABLE users.profiles
        ADD CONSTRAINT fk_profiles_global_role
        FOREIGN KEY (global_role_id) REFERENCES config.global_roles(id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_global_role
    ON users.profiles(global_role_id);

-- ============================================================================
-- PARTE 8: SCHEMA modules
-- Módulos, ubicaciones, ambientes, categorías, roles.
-- FK cross-schema PROHIBIDAS. FK internas del mismo schema: normales.
-- ============================================================================

CREATE TABLE IF NOT EXISTS modules.modules (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    VARCHAR(100) NOT NULL,
    slug                    VARCHAR(100) NOT NULL UNIQUE,
    description             TEXT         NULL,
    type                    VARCHAR(50)  NOT NULL,
    image_url               TEXT         NULL,
    is_active               BOOLEAN      NOT NULL DEFAULT true,
    deleted_at              TIMESTAMPTZ  NULL,
    scheduled_hard_delete_at TIMESTAMPTZ NULL,   -- hard delete automático 90 días tras soft-delete
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_modules_active
    ON modules.modules(is_active) WHERE deleted_at IS NULL;

DO $$ BEGIN
    CREATE TRIGGER trg_modules_updated_at
        BEFORE UPDATE ON modules.modules
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE modules.modules IS
    'Registro maestro de módulos. type es VARCHAR (no enum) para tipos custom.';

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

DO $$ BEGIN
    CREATE TRIGGER trg_modules_locations_updated_at
        BEFORE UPDATE ON modules.locations
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS modules.environments (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    location_id UUID         NOT NULL REFERENCES modules.locations(id)  ON DELETE CASCADE,
    module_id   UUID         NOT NULL REFERENCES modules.modules(id)    ON DELETE CASCADE,
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

DO $$ BEGIN
    CREATE TRIGGER trg_modules_environments_updated_at
        BEFORE UPDATE ON modules.environments
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE modules.environments IS
    'Todo ticket y todo activo lleva environment_id.
     La asignación filtra siempre por environment_id.';

CREATE TABLE IF NOT EXISTS modules.categories (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
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

DO $$ BEGIN
    CREATE TRIGGER trg_modules_categories_updated_at
        BEFORE UPDATE ON modules.categories
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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

DO $$ BEGIN
    CREATE TRIGGER trg_modules_roles_updated_at
        BEFORE UPDATE ON modules.module_roles
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE modules.module_roles IS
    'Catálogo de roles disponibles por módulo.
     Roles estándar: usuario, tecnico, jefe_tecnico, admin_modulo.
     Nombres VARCHAR (dinámicos, no enum).';

CREATE TABLE IF NOT EXISTS modules.user_module_roles (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    module_id   UUID         NOT NULL REFERENCES modules.modules(id)      ON DELETE CASCADE,
    role_id     UUID         NOT NULL REFERENCES modules.module_roles(id)  ON DELETE RESTRICT,
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

DO $$ BEGIN
    CREATE TRIGGER trg_umr_updated_at
        BEFORE UPDATE ON modules.user_module_roles
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE modules.user_module_roles IS
    'Un usuario puede pertenecer a múltiples módulos y tener múltiples roles.
     El superadmin (users.profiles.is_superadmin) supera todos los roles.
     [FIX-2] user_id validado vía trigger app.trg_umr_validate_user_exists.';

-- ============================================================================
-- PARTE 9: SCHEMA tickets — Motor FSM y SLA data-driven
-- ============================================================================

CREATE TABLE IF NOT EXISTS tickets.workflow_versions (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     UUID         NOT NULL,
    version       INTEGER      NOT NULL,
    description   TEXT         NULL,
    is_active     BOOLEAN      NOT NULL DEFAULT false,
    deprecated_at TIMESTAMPTZ  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, version)
);

DO $$ BEGIN
    CREATE TRIGGER trg_wfv_updated_at
        BEFORE UPDATE ON tickets.workflow_versions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets.states (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id UUID         NOT NULL
                            REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE,
    module_id           UUID         NOT NULL,
    name                VARCHAR(50)  NOT NULL,
    label               VARCHAR(100) NOT NULL,
    is_initial          BOOLEAN      NOT NULL DEFAULT false,
    is_final            BOOLEAN      NOT NULL DEFAULT false,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    version             INTEGER      NOT NULL DEFAULT 1,
    deprecated_at       TIMESTAMPTZ  NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_states_wfv
    ON tickets.states(workflow_version_id) WHERE is_active = true;

DO $$ BEGIN
    CREATE TRIGGER trg_states_updated_at
        BEFORE UPDATE ON tickets.states
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets.transitions (
    id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id UUID         NOT NULL
                            REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE,
    module_id           UUID         NOT NULL,
    from_state_id       UUID         NOT NULL REFERENCES tickets.states(id) ON DELETE CASCADE,
    to_state_id         UUID         NOT NULL REFERENCES tickets.states(id) ON DELETE CASCADE,
    name                VARCHAR(100) NOT NULL,
    is_active           BOOLEAN      NOT NULL DEFAULT true,
    version             INTEGER      NOT NULL DEFAULT 1,
    deprecated_at       TIMESTAMPTZ  NULL,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_transitions_wfv_from
    ON tickets.transitions(workflow_version_id, from_state_id) WHERE is_active = true;

DO $$ BEGIN
    CREATE TRIGGER trg_transitions_updated_at
        BEFORE UPDATE ON tickets.transitions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets.transition_rules (
    id            UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    transition_id UUID               NOT NULL
                      REFERENCES tickets.transitions(id) ON DELETE CASCADE,
    role_name     VARCHAR(50)        NOT NULL,
    condition_expression TEXT        NULL,
    action_type   public.action_type NOT NULL,
    action_payload JSONB             NULL,
    created_at    TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_trules_transition
    ON tickets.transition_rules(transition_id);

DO $$ BEGIN
    CREATE TRIGGER trg_transition_rules_updated_at
        BEFORE UPDATE ON tickets.transition_rules
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets.sla_policies (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id     UUID         NOT NULL,
    name          VARCHAR(100) NOT NULL,
    description   TEXT         NULL,
    version       INTEGER      NOT NULL DEFAULT 1,
    is_active     BOOLEAN      NOT NULL DEFAULT false,
    deprecated_at TIMESTAMPTZ  NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(module_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_policies_module
    ON tickets.sla_policies(module_id) WHERE is_active = true;

DO $$ BEGIN
    CREATE TRIGGER trg_sla_policies_updated_at
        BEFORE UPDATE ON tickets.sla_policies
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets.sla_rules (
    id                   UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id            UUID                  NOT NULL
                             REFERENCES tickets.sla_policies(id) ON DELETE CASCADE,
    priority_result      public.priority_level NOT NULL,
    resolution_time_hours INTEGER              NOT NULL CHECK (resolution_time_hours > 0),
    rule_order           INTEGER               NOT NULL,
    valid_from           TIMESTAMPTZ           NULL,
    valid_until          TIMESTAMPTZ           NULL,
    created_at           TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_rules_policy
    ON tickets.sla_rules(policy_id);

DO $$ BEGIN
    CREATE TRIGGER trg_sla_rules_updated_at
        BEFORE UPDATE ON tickets.sla_rules
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS tickets.sla_conditions (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    rule_id       UUID         NOT NULL
                      REFERENCES tickets.sla_rules(id) ON DELETE CASCADE,
    field         VARCHAR(100) NOT NULL,
    operator      VARCHAR(10)  NOT NULL
                      CHECK (operator IN ('=','!=','>','<','>=','<=','IN')),
    value         TEXT         NOT NULL,
    logical_group INTEGER      NOT NULL,
    order_index   INTEGER      NOT NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_conditions_rule_group
    ON tickets.sla_conditions(rule_id, logical_group, order_index);

DO $$ BEGIN
    CREATE TRIGGER trg_sla_conditions_updated_at
        BEFORE UPDATE ON tickets.sla_conditions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tickets.sla_conditions IS
    'Condiciones data-driven para reglas SLA. Evaluadas por tickets.evaluate_sla_condition().
     field: nombre del campo en el contexto JSONB del ticket.
     logical_group: condiciones del mismo grupo se combinan con AND.
     Grupos distintos se combinan con OR (basta uno que cumpla).
     Ejemplo: group=1 → category_id=X AND urgency=alta → prioridad critica, 4h.';

-- [ISSUE-2] Documenta formato de value para operator=IN y operadores numéricos.
COMMENT ON COLUMN tickets.sla_conditions.value IS
    'Valor a comparar. Para operator=IN: lista CSV separada por comas
     (ej: "alta,critica"). evaluate_sla_condition usa el campo ''values'' (array JSONB)
     si existe; si no, hace split CSV sobre este campo. Para operadores numéricos
     (>, <, >=, <=): debe ser parseable como NUMERIC; si no lo es, la condición
     devuelve false sin abortar (ISSUE-1 hardening).';

-- ── tickets.tickets (PARTICIONADA RANGE por created_at — INMUTABLE) ───────────
CREATE TABLE IF NOT EXISTS tickets.tickets (
    id                  UUID                  NOT NULL DEFAULT gen_random_uuid(),
    module_id           UUID                  NOT NULL,
    workflow_version_id UUID                  NOT NULL,
    current_state_id    UUID                  NOT NULL,
    environment_id      UUID                  NOT NULL,
    category_id         UUID                  NOT NULL,
    created_by          UUID                  NOT NULL,
    priority            public.priority_level NOT NULL DEFAULT 'media',
    urgency             public.urgency_level  NOT NULL DEFAULT 'media',
    impact              public.impact_level   NOT NULL DEFAULT 'medio',
    sla_policy_id       UUID                  NOT NULL,
    sla_deadline        TIMESTAMPTZ           NULL,
    reprocess_count     INTEGER               NOT NULL DEFAULT 0
                            CHECK (reprocess_count <= 1),
    version             INTEGER               NOT NULL DEFAULT 1,
    title               VARCHAR(255)          NOT NULL,
    description         TEXT                  NULL,
    created_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ           NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

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
     [v6 FIX-3] La PK compuesta (id, created_at) es requerimiento de PostgreSQL para
     tablas particionadas con RANGE: la partition key debe ser parte de la PK.
     La unicidad de id está garantizada por gen_random_uuid() (UUID4 via pgcrypto)
     con probabilidad de colisión < 1 en 10^36 — no requiere UNIQUE global.
     Para lookups eficientes por id solo se usa idx_tickets_id_lookup (no-unique BTREE).';

-- [v6 FIX-3] BTREE no-unique para lookup por id sin partition pruning
CREATE INDEX IF NOT EXISTS idx_tickets_id_lookup
    ON tickets.tickets (id);

-- FKs same-schema (dentro del schema tickets — permitidas)
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

-- ── tickets.fn_validate_ticket_coherence [ISSUE-6] ───────────────────────────
-- Trigger BEFORE INSERT: verifica que module_id, current_state_id y
-- workflow_version_id sean mutuamente coherentes. Previene tickets con estados
-- de módulos distintos al del ticket — integridad que las FK individuales no cubren.
CREATE OR REPLACE FUNCTION tickets.fn_validate_ticket_coherence()
RETURNS TRIGGER AS $$
DECLARE
    v_state_module UUID;
    v_state_wfv    UUID;
    v_wfv_module   UUID;
BEGIN
    SELECT s.module_id, s.workflow_version_id
    INTO   v_state_module, v_state_wfv
    FROM   tickets.states s WHERE s.id = NEW.current_state_id;

    SELECT wv.module_id INTO v_wfv_module
    FROM   tickets.workflow_versions wv WHERE wv.id = NEW.workflow_version_id;

    IF v_state_module IS DISTINCT FROM NEW.module_id THEN
        RAISE EXCEPTION 'Incoherencia: state.module_id (%) != ticket.module_id (%)',
            v_state_module, NEW.module_id;
    END IF;
    IF v_state_wfv IS DISTINCT FROM NEW.workflow_version_id THEN
        RAISE EXCEPTION 'Incoherencia: state.workflow_version_id (%) != ticket.workflow_version_id (%)',
            v_state_wfv, NEW.workflow_version_id;
    END IF;
    IF v_wfv_module IS DISTINCT FROM NEW.module_id THEN
        RAISE EXCEPTION 'Incoherencia: workflow_version.module_id (%) != ticket.module_id (%)',
            v_wfv_module, NEW.module_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, tickets;

COMMENT ON FUNCTION tickets.fn_validate_ticket_coherence IS
    '[ISSUE-6] Valida coherencia módulo/estado/workflow en INSERT de tickets.
     Las FK individuales solo verifican existencia, no coherencia entre sí.
     Dispara: BEFORE INSERT ON tickets.tickets.';

-- Trigger functions para tickets (se APLICAN en PARTE 15 tras las particiones)
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
            'ticket', NEW.id,
            jsonb_build_object('state_id', OLD.current_state_id),
            jsonb_build_object('state_id', NEW.current_state_id),
            now()
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, tickets, audit, app;

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
   SET search_path = pg_catalog, public, tickets, app;

-- ── tickets.ticket_assignments (FIX-9: HASH particionada por ticket_id) ──────
-- PK incluye ticket_id (requerimiento de PG para particionadas).
-- HASH por ticket_id garantiza que TODAS las asignaciones de un ticket
-- vayan al mismo cubo → uq_ta_one_active_owner sigue siendo globalmente efectiva.
CREATE TABLE IF NOT EXISTS tickets.ticket_assignments (
    id            UUID                   NOT NULL DEFAULT gen_random_uuid(),
    ticket_id     UUID                   NOT NULL,
    user_id       UUID                   NOT NULL,
    role          public.assignment_role NOT NULL,
    assigned_by   UUID                   NOT NULL,
    assigned_at   TIMESTAMPTZ            NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ            NULL,
    is_active     BOOLEAN                NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ            NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ            NOT NULL DEFAULT now(),
    PRIMARY KEY (id, ticket_id)
) PARTITION BY HASH (ticket_id);

CREATE INDEX IF NOT EXISTS idx_ta_ticket_active
    ON tickets.ticket_assignments(ticket_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_active
    ON tickets.ticket_assignments(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_role_active
    ON tickets.ticket_assignments(user_id, role, is_active);

-- [FIX-5/FIX-9] Partial UNIQUE: ticket_id es la partition key → PG permite este índice
-- único global porque ticket_id está incluido en la restricción de unicidad.
-- Todos los rows de un ticket_id van al mismo cubo HASH → unicidad efectiva.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ta_one_active_owner
    ON tickets.ticket_assignments (ticket_id)
    WHERE role = 'owner' AND is_active = true;

DO $$ BEGIN
    CREATE TRIGGER trg_ta_updated_at
        BEFORE UPDATE ON tickets.ticket_assignments
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tickets.ticket_assignments IS
    '[FIX-9] HASH particionada por ticket_id (8 cubos).
     PK (id, ticket_id) requerida para particionadas.
     uq_ta_one_active_owner es efectivamente global porque HASH(ticket_id)
     garantiza que todos los rows de un ticket van al mismo cubo.
     [FIX-2] user_id validado contra users.profiles vía trigger.';

-- ── tickets.ticket_state_history (INMUTABLE, PARTICIONADA RANGE) ─────────────
-- [FIX-7] Sin updated_at: tabla inmutable, solo INSERT, nunca UPDATE.
CREATE TABLE IF NOT EXISTS tickets.ticket_state_history (
    id               UUID         NOT NULL DEFAULT gen_random_uuid(),
    ticket_id        UUID         NOT NULL,
    from_state_id    UUID         NOT NULL,
    to_state_id      UUID         NOT NULL,
    transitioned_by  UUID         NOT NULL,
    transition_reason TEXT        NULL,
    transitioned_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (id, transitioned_at)
) PARTITION BY RANGE (transitioned_at);

CREATE INDEX IF NOT EXISTS idx_tickets_tsh_ticket_id
    ON tickets.ticket_state_history(ticket_id);

COMMENT ON TABLE tickets.ticket_state_history IS
    'Trazabilidad completa e inmutable de cambios de estado.
     [FIX-7] Sin updated_at: tabla de solo INSERT, actualizar no tiene semántica.
     Particionada mensualmente por transitioned_at.';

-- ── tickets.ticket_sla_tracking ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.ticket_sla_tracking (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id     UUID         NOT NULL UNIQUE,
    sla_policy_id UUID         NOT NULL,
    sla_rule_id   UUID         NOT NULL,
    started_at    TIMESTAMPTZ  NOT NULL,
    deadline_at   TIMESTAMPTZ  NOT NULL,
    paused_at     TIMESTAMPTZ  NULL,
    resumed_at    TIMESTAMPTZ  NULL,
    breached_at   TIMESTAMPTZ  NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'active'
                      CHECK (status IN ('active','paused','met','breached')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_slat_ticket
    ON tickets.ticket_sla_tracking(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_slat_status_deadline
    ON tickets.ticket_sla_tracking(status, deadline_at);

DO $$ BEGIN
    CREATE TRIGGER trg_sla_tracking_updated_at
        BEFORE UPDATE ON tickets.ticket_sla_tracking
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tickets.ticket_approvals (INMUTABLE — firma digital) ──────────────────────
CREATE TABLE IF NOT EXISTS tickets.ticket_approvals (
    id             UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id      UUID                   NOT NULL,
    user_id        UUID                   NOT NULL,
    token          VARCHAR(255)           NOT NULL UNIQUE,
    status         public.approval_status NOT NULL DEFAULT 'pending',
    signature_hash TEXT                   NULL,
    ip_address     INET                   NULL,
    user_agent     TEXT                   NULL,
    approved_at    TIMESTAMPTZ            NULL,
    expires_at     TIMESTAMPTZ            NOT NULL,
    created_at     TIMESTAMPTZ            NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ            NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tickets_approvals_ticket
    ON tickets.ticket_approvals(ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_token
    ON tickets.ticket_approvals(token);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_status_expires
    ON tickets.ticket_approvals(status, expires_at);

DO $$ BEGIN
    CREATE TRIGGER trg_ticket_approvals_updated_at
        BEFORE UPDATE ON tickets.ticket_approvals
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tickets.ticket_approvals IS
    'Firma digital para cierre de ticket.
     Flujo: técnico marca realizado → token generado → usuario notificado →
     aprueba (cerrado+signature_hash) | rechaza (reproceso) | expira (auto_close 2d).';

-- ── tickets.ticket_comments (FIX-9: RANGE particionada por created_at) ───────
CREATE TABLE IF NOT EXISTS tickets.ticket_comments (
    id           UUID         NOT NULL DEFAULT gen_random_uuid(),
    ticket_id    UUID         NOT NULL,
    user_id      UUID         NOT NULL,
    comment_type VARCHAR(20)  NOT NULL CHECK (comment_type IN ('internal','public')),
    content      TEXT         NOT NULL,
    attachments  JSONB        NULL,
    deleted_at   TIMESTAMPTZ  NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_tickets_comments_ticket
    ON tickets.ticket_comments(ticket_id) WHERE deleted_at IS NULL;

DO $$ BEGIN
    CREATE TRIGGER trg_ticket_comments_updated_at
        BEFORE UPDATE ON tickets.ticket_comments
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tickets.ticket_comments IS
    '[FIX-9] RANGE particionada por created_at (mensual).
     PK (id, created_at) requerida para particionadas.';

-- ── tickets.technician_availability ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.technician_availability (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
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

DO $$ BEGIN
    CREATE TRIGGER trg_tech_availability_updated_at
        BEFORE UPDATE ON tickets.technician_availability
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tickets.technician_leaves (FIX-6: EXCLUDE solapamiento de ausencias) ─────
CREATE TABLE IF NOT EXISTS tickets.technician_leaves (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    start_date  DATE         NOT NULL,
    end_date    DATE         NOT NULL,
    reason      TEXT         NULL,
    approved_by UUID         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    -- [FIX-6] Impide que un mismo técnico tenga dos ausencias solapadas.
    -- Requiere la extensión btree_gist (incluida en PARTE 0).
    CONSTRAINT uq_tech_leaves_no_overlap EXCLUDE USING GIST (
        user_id    WITH =,
        daterange(start_date, end_date, '[]') WITH &&
    )
);

CREATE INDEX IF NOT EXISTS idx_technician_leaves_user_dates
    ON tickets.technician_leaves(user_id, start_date, end_date);

DO $$ BEGIN
    CREATE TRIGGER trg_tech_leaves_updated_at
        BEFORE UPDATE ON tickets.technician_leaves
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tickets.technician_leaves IS
    '[FIX-6] EXCLUDE USING GIST previene ausencias solapadas para el mismo técnico.
     daterange(..., ''[]'') = rango inclusivo en ambos extremos.
     Un técnico no puede tener dos registros con fechas que se solapen.';

-- ── tickets.technician_category_skills ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.technician_category_skills (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID         NOT NULL,
    module_id   UUID         NOT NULL,
    category_id UUID         NOT NULL,
    is_active   BOOLEAN      NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(user_id, module_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_tech_cat_skills_user_module_cat
    ON tickets.technician_category_skills(user_id, module_id, category_id)
    WHERE is_active = true;

DO $$ BEGIN
    CREATE TRIGGER trg_tech_skills_updated_at
        BEFORE UPDATE ON tickets.technician_category_skills
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tickets.technician_profiles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.technician_profiles (
    id                UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID                   NOT NULL,
    module_id         UUID                   NOT NULL,
    technician_type   public.technician_type NOT NULL DEFAULT 'generalist',
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

DO $$ BEGIN
    CREATE TRIGGER trg_tech_profiles_updated_at
        BEFORE UPDATE ON tickets.technician_profiles
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tickets.technician_profiles IS
    'Perfil de asignación híbrida.
     generalist: cualquier categoría. specialist: solo sus skills. both: ambas.
     max_daily_tickets NULL → usa assignment_policies.specialist_overflow_threshold.';

-- ── tickets.assignment_policies ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.assignment_policies (
    id                            UUID                     PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id                     UUID                     NOT NULL UNIQUE,
    use_specialists               BOOLEAN                  NOT NULL DEFAULT true,
    use_generalists               BOOLEAN                  NOT NULL DEFAULT true,
    specialist_overflow_enabled   BOOLEAN                  NOT NULL DEFAULT true,
    specialist_overflow_threshold INTEGER                  NOT NULL DEFAULT 5,
    assignment_method             public.assignment_method NOT NULL DEFAULT 'round_robin',
    updated_by                    UUID                     NULL,
    created_at                    TIMESTAMPTZ              NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ              NOT NULL DEFAULT now()
);

DO $$ BEGIN
    CREATE TRIGGER trg_assignment_policies_updated_at
        BEFORE UPDATE ON tickets.assignment_policies
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── tickets.ticket_assignment_counters ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tickets.ticket_assignment_counters (
    id                    UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id             UUID                    NOT NULL,
    environment_id        UUID                    NOT NULL,
    category_id           UUID                    NULL,
    technician_type       public.technician_type  NOT NULL DEFAULT 'generalist',
    last_assigned_user_id UUID                    NULL,
    assignment_count      BIGINT                  NOT NULL DEFAULT 0,
    created_at            TIMESTAMPTZ             NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ             NOT NULL DEFAULT now()
);

-- NULLS NOT DISTINCT (PG 15+): trata NULL como igual para ON CONFLICT con category_id NULL
CREATE UNIQUE INDEX IF NOT EXISTS uq_tac_pool
    ON tickets.ticket_assignment_counters
    (module_id, environment_id, category_id, technician_type)
    NULLS NOT DISTINCT;

CREATE INDEX IF NOT EXISTS idx_tac_module_env
    ON tickets.ticket_assignment_counters(module_id, environment_id);

DO $$ BEGIN
    CREATE TRIGGER trg_tac_updated_at
        BEFORE UPDATE ON tickets.ticket_assignment_counters
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE tickets.ticket_assignment_counters IS
    'Puntero de round-robin por pool (module+env+category+type).
     category_id NULL = pool generalista del módulo/environment.
     NULLS NOT DISTINCT: trata category_id NULL como valor único para ON CONFLICT.';

-- ============================================================================
-- PARTE 10: SCHEMA inventory
-- ============================================================================

CREATE TABLE IF NOT EXISTS inventory.assets (
    id              UUID                PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       UUID                NOT NULL,
    environment_id  UUID                NOT NULL,
    category_id     UUID                NOT NULL,
    parent_asset_id UUID                NULL REFERENCES inventory.assets(id) ON DELETE SET NULL,
    name            VARCHAR(255)        NOT NULL,
    description     TEXT                NULL,
    specifications  JSONB               NULL,
    qr_code         VARCHAR(100)        NOT NULL UNIQUE,
    serial_number   VARCHAR(100)        NULL,
    status          public.asset_status NOT NULL DEFAULT 'disponible',
    version         INTEGER             NOT NULL DEFAULT 1,
    deleted_at      TIMESTAMPTZ         NULL,
    created_at      TIMESTAMPTZ         NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ         NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_assets_env_status
    ON inventory.assets(environment_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_category
    ON inventory.assets(category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_status_active
    ON inventory.assets(status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_qr
    ON inventory.assets(qr_code);

DO $$ BEGIN
    CREATE TRIGGER trg_assets_updated_at
        BEFORE UPDATE ON inventory.assets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION inventory.fn_assets_generate_qr()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.qr_code IS NULL OR NEW.qr_code = '' THEN
        NEW.qr_code := 'QR-' || gen_random_uuid()::TEXT;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_assets_generate_qr
        BEFORE INSERT ON inventory.assets
        FOR EACH ROW EXECUTE FUNCTION inventory.fn_assets_generate_qr();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION inventory.fn_asset_version_bump()
RETURNS TRIGGER AS $$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
    CREATE TRIGGER trg_asset_version_bump
        BEFORE UPDATE ON inventory.assets
        FOR EACH ROW EXECUTE FUNCTION inventory.fn_asset_version_bump();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE inventory.assets IS
    'Activos físicos. qr_code generado automáticamente si es NULL.
     version para optimistic locking: UPDATE ... WHERE id=$1 AND version=$2.';

CREATE TABLE IF NOT EXISTS inventory.asset_relationships (
    id                UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_asset_id   UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE CASCADE,
    child_asset_id    UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE CASCADE,
    relationship_type VARCHAR(50)  NOT NULL,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(parent_asset_id, child_asset_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_ar_parent ON inventory.asset_relationships(parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_ar_child  ON inventory.asset_relationships(child_asset_id);

DO $$ BEGIN
    CREATE TRIGGER trg_asset_relationships_updated_at
        BEFORE UPDATE ON inventory.asset_relationships
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inventory.ticket_assets (
    id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  UUID         NOT NULL,
    asset_id   UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE RESTRICT,
    notes      TEXT         NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    UNIQUE(ticket_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_inv_ta_ticket ON inventory.ticket_assets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_inv_ta_asset  ON inventory.ticket_assets(asset_id);

DO $$ BEGIN
    CREATE TRIGGER trg_inv_ticket_assets_updated_at
        BEFORE UPDATE ON inventory.ticket_assets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inventory.asset_requests (
    id             UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id      UUID         NOT NULL,
    user_id        UUID         NOT NULL,
    category_id    UUID         NOT NULL,
    subcategory_id UUID         NULL,
    description    TEXT         NULL,
    quantity       INTEGER      NOT NULL DEFAULT 1 CHECK (quantity > 0),
    justification  TEXT         NOT NULL,
    status         VARCHAR(20)  NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','fulfilled')),
    reviewed_by    UUID         NULL,
    reviewed_at    TIMESTAMPTZ  NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_req_user_status   ON inventory.asset_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_req_module_status ON inventory.asset_requests(module_id, status);

DO $$ BEGIN
    CREATE TRIGGER trg_asset_requests_updated_at
        BEFORE UPDATE ON inventory.asset_requests
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS inventory.asset_assignments (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id      UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE RESTRICT,
    user_id       UUID         NOT NULL,
    assigned_by   UUID         NOT NULL,
    request_id    UUID         NULL,
    assigned_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    unassigned_at TIMESTAMPTZ  NULL,
    status        VARCHAR(20)  NOT NULL DEFAULT 'activo'
                      CHECK (status IN ('activo','devuelto','transferido')),
    notes         TEXT         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_ass_asset_status ON inventory.asset_assignments(asset_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_ass_user_status  ON inventory.asset_assignments(user_id, status);

DO $$ BEGIN
    CREATE TRIGGER trg_asset_assignments_updated_at
        BEFORE UPDATE ON inventory.asset_assignments
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── inventory.asset_assignment_history (INMUTABLE) ────────────────────────────
-- [FIX-7] Sin updated_at: tabla de solo INSERT.
CREATE TABLE IF NOT EXISTS inventory.asset_assignment_history (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id      UUID         NOT NULL REFERENCES inventory.assets(id) ON DELETE RESTRICT,
    user_id       UUID         NOT NULL,
    assigned_by   UUID         NOT NULL,
    assignment_id UUID         NULL,
    action        VARCHAR(30)  NOT NULL
                      CHECK (action IN ('asignado','devuelto','transferido',
                                        'dado_de_baja','reparacion')),
    reason        TEXT         NULL,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inv_aah_asset ON inventory.asset_assignment_history(asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_aah_user  ON inventory.asset_assignment_history(user_id);

COMMENT ON TABLE inventory.asset_assignment_history IS
    'Historial inmutable de movimientos de activos. Solo INSERT, nunca UPDATE/DELETE.
     [FIX-7] Sin updated_at: no tiene semántica en tabla inmutable.';

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

DO $$ BEGIN
    CREATE TRIGGER trg_procurement_updated_at
        BEFORE UPDATE ON inventory.asset_procurement_requests
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 11: SCHEMA files
-- ============================================================================

CREATE TABLE IF NOT EXISTS files.files (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by  UUID         NOT NULL,
    entity_type  VARCHAR(50)  NOT NULL,
    entity_id    UUID         NOT NULL,
    file_name    VARCHAR(255) NOT NULL,
    file_size    BIGINT       NOT NULL CHECK (file_size > 0),
    mime_type    VARCHAR(100) NOT NULL,
    storage_url  TEXT         NOT NULL,
    is_confirmed BOOLEAN      NOT NULL DEFAULT false,
    expires_at   TIMESTAMPTZ  NULL,
    deleted_at   TIMESTAMPTZ  NULL,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_files_entity
    ON files.files(entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by
    ON files.files(uploaded_by) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_temporary
    ON files.files(expires_at) WHERE is_confirmed = false AND deleted_at IS NULL;

DO $$ BEGIN
    CREATE TRIGGER trg_files_updated_at
        BEFORE UPDATE ON files.files
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE files.files IS
    'Archivos del sistema. is_confirmed=false = temporal pendiente de confirmar.
     Los temporales se limpian según expires_at mediante job de mantenimiento.
     entity_type/entity_id: relación polimórfica validada en aplicación.';

-- ============================================================================
-- PARTE 12: SCHEMA notifications
-- Las notificaciones se generan SIEMPRE mediante events.outbox.
-- ============================================================================

CREATE TABLE IF NOT EXISTS notifications.notification_templates (
    id            UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    VARCHAR(100)                NOT NULL,
    channel       public.notification_channel NOT NULL,
    subject       VARCHAR(255)                NULL,
    template_body TEXT                        NOT NULL,
    variables     JSONB                       NOT NULL DEFAULT '[]',
    is_active     BOOLEAN                     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
    UNIQUE(event_type, channel)
);

DO $$ BEGIN
    CREATE TRIGGER trg_notif_templates_updated_at
        BEFORE UPDATE ON notifications.notification_templates
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS notifications.notification_logs (
    id            UUID                        NOT NULL DEFAULT gen_random_uuid(),
    user_id       UUID                        NOT NULL,
    template_id   UUID                        NULL,
    event_type    VARCHAR(100)                NOT NULL,
    channel       public.notification_channel NOT NULL,
    status        public.notification_status  NOT NULL DEFAULT 'pending',
    payload       JSONB                       NOT NULL,
    error_message TEXT                        NULL,
    sent_at       TIMESTAMPTZ                 NULL,
    created_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ                 NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_notif_logs_user_status
    ON notifications.notification_logs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event_channel
    ON notifications.notification_logs(event_type, channel);

DO $$ BEGIN
    CREATE TRIGGER trg_notif_logs_updated_at
        BEFORE UPDATE ON notifications.notification_logs
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 13: SCHEMA audit
-- Log central e INMUTABLE. Solo INSERT. PARTICIONADA.
-- ============================================================================

-- [FIX-7] Sin updated_at: tabla inmutable de solo INSERT.
CREATE TABLE IF NOT EXISTS audit.event_log (
    id          UUID              NOT NULL DEFAULT gen_random_uuid(),
    actor_id    UUID              NULL,
    actor_type  public.actor_type NOT NULL,
    action      VARCHAR(100)      NOT NULL,
    entity_type VARCHAR(50)       NOT NULL,
    entity_id   UUID              NOT NULL,
    old_value   JSONB             NULL,
    new_value   JSONB             NULL,
    ip_address  INET              NULL,
    user_agent  TEXT              NULL,
    created_at  TIMESTAMPTZ       NOT NULL DEFAULT now(),
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON audit.event_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor
    ON audit.event_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created_at
    ON audit.event_log(created_at DESC);

COMMENT ON TABLE audit.event_log IS
    'Log central inmutable. Solo INSERT, nunca UPDATE/DELETE.
     [FIX-7] Sin updated_at: inmutable no necesita esta columna.
     actor_type=user → actor_id = users.profiles.id.
     actor_type=system|job → actor_id puede ser NULL.
     Particionada mensualmente por created_at.';

-- ============================================================================
-- PARTE 14: SCHEMA events (outbox pattern)
-- ============================================================================

CREATE TABLE IF NOT EXISTS events.outbox (
    id             UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(50)          NOT NULL,
    aggregate_id   UUID                 NOT NULL,
    event_type     VARCHAR(100)         NOT NULL,
    payload        JSONB                NOT NULL,
    status         public.outbox_status NOT NULL DEFAULT 'pending',
    retries        SMALLINT             NOT NULL DEFAULT 0,
    last_error     TEXT                 NULL,
    scheduled_at   TIMESTAMPTZ          NOT NULL DEFAULT now(),
    processed_at   TIMESTAMPTZ          NULL,
    created_at     TIMESTAMPTZ          NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_outbox_status_scheduled
    ON events.outbox(status, scheduled_at)
    WHERE status IN ('pending','failed');
CREATE INDEX IF NOT EXISTS idx_events_outbox_aggregate
    ON events.outbox(aggregate_type, aggregate_id);

DO $$ BEGIN
    CREATE TRIGGER trg_events_outbox_updated_at
        BEFORE UPDATE ON events.outbox
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE events.outbox IS
    'Outbox pattern para comunicación eventual hacia RabbitMQ (Fase 2).
     Un worker lee filas pending/failed, publica el evento y actualiza status=processed.
     retries y last_error permiten reintentos con backoff.
     En Fase 1 (monolito) los eventos los consume el mismo proceso.';

-- ============================================================================
-- PARTE 15: TRIGGERS OBLIGATORIOS DEL PROMPT
-- Se aplican aquí, luego de crear todas las tablas.
-- ============================================================================

-- [ISSUE-6] Coherencia módulo/estado/workflow — BEFORE INSERT para bloquear incoherencias
DO $$ BEGIN
    CREATE TRIGGER trg_ticket_coherence
        BEFORE INSERT ON tickets.tickets
        FOR EACH ROW EXECUTE FUNCTION tickets.fn_validate_ticket_coherence();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ticket_version_bump
        BEFORE UPDATE ON tickets.tickets
        FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_version_bump();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ticket_updated_at
        BEFORE UPDATE ON tickets.tickets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ticket_state_audit
        AFTER UPDATE OF current_state_id ON tickets.tickets
        FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_audit();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ticket_state_history
        AFTER UPDATE OF current_state_id ON tickets.tickets
        FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_history();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 16: PARTICIONES INICIALES
-- tickets.tickets, ticket_state_history, audit.event_log,
-- notifications.notification_logs → RANGE mensual 2026-01 a 2027-12
-- tickets.ticket_assignments → HASH 8 cubos  [FIX-9]
-- tickets.ticket_comments → RANGE mensual 2026-01 a 2027-12  [FIX-9]
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

        -- [FIX-9] ticket_comments particionada mensualmente
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS tickets.ticket_comments_%s
             PARTITION OF tickets.ticket_comments FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next);

        v_cur := v_next;
    END LOOP;
END;
$$;

-- [FIX-9] ticket_assignments: 8 cubos HASH por ticket_id
DO $$
DECLARE i INT;
BEGIN
    FOR i IN 0..7 LOOP
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS tickets.ticket_assignments_%s
             PARTITION OF tickets.ticket_assignments
             FOR VALUES WITH (MODULUS 8, REMAINDER %s)',
            i, i);
    END LOOP;
END;
$$;

-- ============================================================================
-- PARTE 17: SCHEMAS DE SOPORTE (conservados de v4.1 — valor adicional)
-- ============================================================================

-- ── app.settings (SYSTEM-LEVEL BOOTSTRAP ONLY) [FIX-8] ───────────────────────
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

COMMENT ON TABLE app.settings IS
    '[FIX-8] SYSTEM-LEVEL BOOTSTRAP ONLY. Solo para parámetros globales del tenant
     (company_info, auth_config, notification_defaults). NUEVOS desarrollos deben
     usar config.module_settings — NO esta tabla.';

CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app.settings(key);

DO $$ BEGIN
    CREATE TRIGGER trg_app_settings_updated_at
        BEFORE UPDATE ON app.settings
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── modules.permissions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.permissions (
    id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id   UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    name        VARCHAR(150) NOT NULL,
    description TEXT         NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at  TIMESTAMPTZ  NULL,
    UNIQUE(module_id, name)
);

CREATE INDEX IF NOT EXISTS idx_modules_permissions_module
    ON modules.permissions(module_id) WHERE deleted_at IS NULL;

DO $$ BEGIN
    CREATE TRIGGER trg_modules_permissions_updated_at
        BEFORE UPDATE ON modules.permissions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── modules.role_permissions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.role_permissions (
    role_id       UUID        NOT NULL REFERENCES modules.module_roles(id) ON DELETE CASCADE,
    permission_id UUID        NOT NULL REFERENCES modules.permissions(id) ON DELETE CASCADE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_id)
);

DO $$ BEGIN
    CREATE TRIGGER trg_role_permissions_updated_at
        BEFORE UPDATE ON modules.role_permissions
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── modules.config (DEPRECATED — ver FIX-8) ──────────────────────────────────
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

CREATE INDEX IF NOT EXISTS idx_modules_config_module ON modules.config(module_id);
CREATE INDEX IF NOT EXISTS idx_modules_config_value  ON modules.config USING gin(value);

DO $$ BEGIN
    CREATE TRIGGER trg_modules_config_updated_at
        BEFORE UPDATE ON modules.config
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE modules.config IS
    '[FIX-8] DEPRECATED. Conservada por compatibilidad con código existente.
     NUEVOS desarrollos deben usar config.module_settings.';

-- ── modules.technician_status ─────────────────────────────────────────────────
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

DO $$ BEGIN
    CREATE TRIGGER trg_tech_status_updated_at
        BEFORE UPDATE ON modules.technician_status
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── modules.technician_assignment_log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.technician_assignment_log (
    id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID         NOT NULL,
    module_id        UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    ticket_id        UUID         NOT NULL,
    assigned_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    assigned_by      VARCHAR(50)  NOT NULL DEFAULT 'system'
                         CHECK (assigned_by IN ('system','admin','manual')),
    assignment_order INT          NOT NULL DEFAULT 0,
    category_slug    VARCHAR(100) NULL,
    is_active        BOOLEAN      NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assign_log_user_module
    ON modules.technician_assignment_log(user_id, module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_log_module
    ON modules.technician_assignment_log(module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_log_ticket
    ON modules.technician_assignment_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_assign_log_active
    ON modules.technician_assignment_log(module_id, user_id) WHERE is_active = true;

DO $$ BEGIN
    CREATE TRIGGER trg_tech_assign_log_updated_at
        BEFORE UPDATE ON modules.technician_assignment_log
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── modules.assets (DEPRECATED — usar inventory.assets) ──────────────────────
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

DO $$ BEGIN
    CREATE TRIGGER trg_mod_assets_updated_at
        BEFORE UPDATE ON modules.assets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE modules.assets IS
    '[FIX-8] DEPRECATED. Conservada por compatibilidad. NUEVOS desarrollos deben
     usar inventory.assets.';

-- ── modules.ticket_assets (DEPRECATED — usar inventory.ticket_assets) ────────
CREATE TABLE IF NOT EXISTS modules.ticket_assets (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id  UUID        NOT NULL,
    asset_id   UUID        NOT NULL REFERENCES modules.assets(id) ON DELETE RESTRICT,
    relation   VARCHAR(50) NOT NULL DEFAULT 'affected'
                   CHECK (relation IN ('affected','replaced','repaired','inspected')),
    notes      TEXT        NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID        NULL
);

CREATE INDEX IF NOT EXISTS idx_mod_ta_ticket ON modules.ticket_assets(ticket_id);
CREATE INDEX IF NOT EXISTS idx_mod_ta_asset  ON modules.ticket_assets(asset_id);

DO $$ BEGIN
    CREATE TRIGGER trg_mod_ticket_assets_updated_at
        BEFORE UPDATE ON modules.ticket_assets
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE modules.ticket_assets IS
    '[FIX-8] DEPRECATED. Conservada por compatibilidad. NUEVOS desarrollos deben
     usar inventory.ticket_assets.';

-- ── modules.technician_skills ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.technician_skills (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    module_id       UUID         NOT NULL REFERENCES modules.modules(id) ON DELETE CASCADE,
    user_id         UUID         NOT NULL,
    category_slug   VARCHAR(100) NULL,
    location_slug   VARCHAR(100) NULL,
    service_type    VARCHAR(100) NULL,
    max_concurrent  SMALLINT     NOT NULL DEFAULT 10 CHECK (max_concurrent BETWEEN 1 AND 100),
    priority        SMALLINT     NOT NULL DEFAULT 0,
    is_active       BOOLEAN      NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    deleted_at      TIMESTAMPTZ  NULL,
    UNIQUE(module_id, user_id, category_slug)
);

CREATE INDEX IF NOT EXISTS idx_tech_skills_module_cat
    ON modules.technician_skills(module_id, category_slug)
    WHERE is_active = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_tech_skills_user
    ON modules.technician_skills(user_id, module_id)
    WHERE is_active = true AND deleted_at IS NULL;

DO $$ BEGIN
    CREATE TRIGGER trg_tech_skills_updated_at
        BEFORE UPDATE ON modules.technician_skills
        FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, app;

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
   SET search_path = pg_catalog, public, app, modules;

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
   SET search_path = pg_catalog, public, app, users;

COMMENT ON FUNCTION app.is_superadmin IS
    '[FIX-5] Devuelve true si el usuario actual es superadmin según
     users.profiles.is_superadmin. Reemplaza el chequeo frágil
     app.get_current_role()=''admin'' en políticas RLS.';

-- ============================================================================
-- PARTE 19: FUNCIONES DE DOMINIO
-- ============================================================================

-- ── tickets.evaluate_sla_condition [FIX-1] ───────────────────────────────────
-- IMMUTABLE: solo opera sobre los JSONB de entrada, sin acceso a BD.
-- Evalúa una condición {field, operator, value/values} contra el contexto
-- del ticket. Operadores soportados: =, !=, >, <, >=, <=, IN.
DROP FUNCTION IF EXISTS tickets.evaluate_sla_condition(JSONB, JSONB);
CREATE OR REPLACE FUNCTION tickets.evaluate_sla_condition(
    p_condition JSONB,
    p_context   JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
    v_field      TEXT    := p_condition->>'field';
    v_operator   TEXT    := p_condition->>'operator';
    v_value      TEXT    := p_condition->>'value';
    v_actual     TEXT;
    v_actual_num NUMERIC;
    v_value_num  NUMERIC;
BEGIN
    v_actual := p_context->>v_field;
    IF v_actual IS NULL THEN
        RETURN false;
    END IF;

    -- Operadores de igualdad: comparación textual directa (no crashea con strings)
    IF v_operator = '=' THEN
        RETURN v_actual = v_value;
    ELSIF v_operator = '!=' THEN
        RETURN v_actual != v_value;
    ELSIF v_operator = 'IN' THEN
        -- [ISSUE-1/ISSUE-2] Acepta 'values' (array JSONB) o 'value' como CSV
        IF p_condition ? 'values' THEN
            RETURN v_actual = ANY(
                ARRAY(SELECT jsonb_array_elements_text(p_condition->'values'))
            );
        ELSE
            RETURN v_actual = ANY(string_to_array(v_value, ','));
        END IF;
    END IF;

    -- [ISSUE-1] Operadores numéricos: cast defensivo — false si no es numérico
    BEGIN
        v_actual_num := v_actual::NUMERIC;
        v_value_num  := v_value::NUMERIC;
    EXCEPTION WHEN invalid_text_representation THEN
        -- Field no es numérico con este operador: condición no aplica → false
        RETURN false;
    END;

    RETURN CASE v_operator
        WHEN '>'  THEN v_actual_num >  v_value_num
        WHEN '<'  THEN v_actual_num <  v_value_num
        WHEN '>=' THEN v_actual_num >= v_value_num
        WHEN '<=' THEN v_actual_num <= v_value_num
        ELSE false
    END;
END;
$$ LANGUAGE plpgsql IMMUTABLE STRICT
   SET search_path = pg_catalog, public;

COMMENT ON FUNCTION tickets.evaluate_sla_condition IS
    '[FIX-1 + ISSUE-1 hardened] Evalúa condición SLA contra contexto JSONB.
     IMMUTABLE STRICT + injection-safe (sin EXECUTE dinámico).
     Operadores: =, !=, IN, >, <, >=, <=.
     Casts numéricos protegidos con EXCEPTION: field no-numérico → false (no crash).
     IN acepta ''values'' (array JSONB) o ''value'' como CSV (compatibilidad resolve_sla).';

-- ── tickets.resolve_sla [FIX-1] ──────────────────────────────────────────────
-- Reescrita completa. Acepta p_context JSONB para evaluación de condiciones
-- vía evaluate_sla_condition() sin EXECUTE dinámico (injection-safe).
-- Semántica: regla matchea si AL MENOS UN logical_group cumple TODAS sus
-- condiciones (OR de grupos, AND dentro de cada grupo). Reglas sin
-- condiciones siempre matchean (default rules).
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
DECLARE
    v_context JSONB;
BEGIN
    -- Construir contexto JSONB del ticket para evaluación de condiciones
    v_context := jsonb_strip_nulls(jsonb_build_object(
        'category_id',    p_category_id::TEXT,
        'environment_id', p_environment_id::TEXT,
        'urgency',        p_urgency::TEXT,
        'impact',         p_impact::TEXT
    ));

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
            sr.rule_order
        FROM   tickets.sla_rules sr
        JOIN   active_policy ap ON ap.id = sr.policy_id
        WHERE (sr.valid_from  IS NULL OR sr.valid_from  <= now())
        AND   (sr.valid_until IS NULL OR sr.valid_until >  now())
    ),
    -- [FIX-1] Evaluar condiciones por logical_group usando evaluate_sla_condition()
    -- bool_and dentro de cada grupo (AND), bool_or entre grupos (OR)
    rule_groups AS (
        SELECT
            sc.rule_id,
            sc.logical_group,
            bool_and(
                tickets.evaluate_sla_condition(
                    jsonb_build_object(
                        'field',    sc.field,
                        'operator', sc.operator,
                        'value',    sc.value
                    ),
                    v_context
                )
            ) AS group_passes
        FROM   tickets.sla_conditions sc
        JOIN   candidate_rules cr ON cr.rule_id = sc.rule_id
        GROUP BY sc.rule_id, sc.logical_group
    ),
    rule_match AS (
        SELECT rule_id, bool_or(group_passes) AS matches
        FROM   rule_groups
        GROUP BY rule_id
    )
    SELECT
        cr.policy_id,
        cr.rule_id,
        cr.priority_result,
        cr.resolution_time_hours
    FROM   candidate_rules cr
    LEFT JOIN rule_match rm ON rm.rule_id = cr.rule_id
    -- Regla matchea: tiene condiciones que pasan, o no tiene condiciones (default)
    WHERE  COALESCE(rm.matches, true) = true
    ORDER  BY cr.rule_order ASC
    LIMIT  1;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, tickets;

COMMENT ON FUNCTION tickets.resolve_sla IS
    '[FIX-1] Resuelve SLA aplicable para un módulo dado. Reescrita completa:
     evalúa logical_groups vía evaluate_sla_condition() IMMUTABLE (injection-safe).
     OR entre grupos, AND dentro de cada grupo. Reglas sin condiciones = default.';

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
   SET search_path = pg_catalog, public, tickets, events, app;

-- ── tickets.assign_ticket_hybrid [FIX-4] ─────────────────────────────────────
CREATE OR REPLACE FUNCTION tickets.assign_ticket_hybrid(p_ticket_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_ticket          RECORD;
    v_policy          RECORD;
    v_selected_tech   UUID;
    v_pool            TEXT;
    v_last_user_id    UUID;
    v_lock_key        TEXT;
    v_assignment_id   UUID;   -- [FIX-4] para detectar carrera concurrente via RETURNING
BEGIN
    SELECT t.id, t.module_id, t.environment_id, t.category_id
    INTO   v_ticket
    FROM   tickets.tickets t
    WHERE  t.id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found');
    END IF;

    -- [ISSUE-3] Pre-check post-lock: asignación previa exitosa (no carrera)
    IF EXISTS (
        SELECT 1 FROM tickets.ticket_assignments
        WHERE  ticket_id = p_ticket_id AND role = 'owner' AND is_active = true
    ) THEN
        RETURN jsonb_build_object(
            'ok',    false,
            'error', 'already_assigned',
            'detail','Ticket already has an active owner from a prior successful call'
        );
    END IF;

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

    -- Pool A: especialistas
    IF v_policy.use_specialists THEN
        v_lock_key := v_ticket.module_id::TEXT || ':' ||
                      v_ticket.environment_id::TEXT || ':' ||
                      COALESCE(v_ticket.category_id::TEXT, 'GEN') || ':specialist';
        PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

        SELECT tac.last_assigned_user_id INTO v_last_user_id
        FROM   tickets.ticket_assignment_counters tac
        WHERE  tac.module_id       = v_ticket.module_id
        AND    tac.environment_id  = v_ticket.environment_id
        AND    tac.category_id     = v_ticket.category_id
        AND    tac.technician_type = 'specialist';

        SELECT tp.user_id INTO v_selected_tech
        FROM   tickets.technician_profiles tp
        JOIN   tickets.technician_category_skills tcs
            ON tcs.user_id      = tp.user_id
            AND tcs.module_id   = tp.module_id
            AND tcs.category_id = v_ticket.category_id
            AND tcs.is_active   = true
        JOIN   modules.user_module_roles umr
            ON umr.user_id    = tp.user_id
            AND umr.module_id = tp.module_id
            AND umr.is_active = true
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
            CASE WHEN v_policy.assignment_method = 'least_load' THEN
                (SELECT COUNT(*) FROM tickets.ticket_assignments ta2
                 WHERE ta2.user_id = tp.user_id AND ta2.is_active = true)
            ELSE 0 END ASC,
            CASE
                WHEN v_last_user_id IS NULL THEN 0
                WHEN tp.user_id > v_last_user_id THEN 0
                ELSE 1
            END ASC,
            tp.user_id ASC
        LIMIT 1;

        IF v_selected_tech IS NOT NULL THEN v_pool := 'specialist'; END IF;
    END IF;

    -- Pool B: generalistas
    IF v_selected_tech IS NULL AND v_policy.use_generalists THEN
        v_lock_key := v_ticket.module_id::TEXT || ':' ||
                      v_ticket.environment_id::TEXT || ':GEN:generalist';
        PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

        SELECT tac.last_assigned_user_id INTO v_last_user_id
        FROM   tickets.ticket_assignment_counters tac
        WHERE  tac.module_id       = v_ticket.module_id
        AND    tac.environment_id  = v_ticket.environment_id
        AND    tac.category_id     IS NULL
        AND    tac.technician_type = 'generalist';

        SELECT tp.user_id INTO v_selected_tech
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
            CASE
                WHEN v_last_user_id IS NULL THEN 0
                WHEN tp.user_id > v_last_user_id THEN 0
                ELSE 1
            END ASC,
            tp.user_id ASC
        LIMIT 1;

        IF v_selected_tech IS NOT NULL THEN v_pool := 'generalist'; END IF;
    END IF;

    -- Escalamiento total
    IF v_selected_tech IS NULL THEN
        INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('ticket', p_ticket_id, 'ticket.assignment_failed',
                jsonb_build_object('ticket_id', p_ticket_id,
                                   'module_id', v_ticket.module_id));
        RETURN jsonb_build_object('ok', false, 'error', 'no_technician_available');
    END IF;

    -- [FIX-4] ON CONFLICT DO NOTHING + RETURNING para detectar carrera concurrente.
    -- uq_ta_one_active_owner: UNIQUE (ticket_id) WHERE role='owner' AND is_active=true
    INSERT INTO tickets.ticket_assignments (
        ticket_id, user_id, role, assigned_by, assigned_at, is_active
    ) VALUES (
        p_ticket_id, v_selected_tech, 'owner',
        COALESCE(app.get_current_user_id(),
            '00000000-0000-0000-0000-000000000001'::UUID),
        now(), true
    )
    ON CONFLICT (ticket_id) WHERE role = 'owner' AND is_active = true
    DO NOTHING
    RETURNING id INTO v_assignment_id;

    -- [FIX-4 / ISSUE-3] RETURNING vacío → otra TX ganó la carrera; seguro reintentar
    IF v_assignment_id IS NULL THEN
        RETURN jsonb_build_object(
            'ok',    false,
            'error', 'concurrent_assignment_race',
            'detail','A concurrent transaction assigned an owner first; safe to retry'
        );
    END IF;

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
   SET search_path = pg_catalog, public, tickets, modules, events, app;

COMMENT ON FUNCTION tickets.assign_ticket_hybrid IS
    '[FIX-4] Asignación híbrida con ON CONFLICT DO NOTHING + RETURNING para
     detectar carrera concurrente sin depender solo de la comprobación previa.
     [FIX-1] Advisory locks por pool para serializar concurrencia.
     Pasos: (1) política del módulo → (2) Pool A specialists → (3) Pool B
     generalistas → (4) escalamiento total → (5) INSERT atómico + counter + outbox.';

-- ── tickets.generate_approval_token ──────────────────────────────────────────
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
   SET search_path = pg_catalog, public, tickets, events;

COMMENT ON FUNCTION tickets.generate_approval_token IS
    'Genera token de aprobación de cierre (firma digital).
     Expira en p_hours horas (default 48h). Job de mantenimiento marca
     approvals expired y cierra tickets con reprocess_count >= 1.';

-- ── maintenance.create_future_partitions [FIX-9] ─────────────────────────────
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
        -- [FIX-9] ticket_comments también particionada mensualmente
        EXECUTE FORMAT(
            'CREATE TABLE IF NOT EXISTS tickets.ticket_comments_%s
             PARTITION OF tickets.ticket_comments FOR VALUES FROM (%L) TO (%L)',
            v_suffix, v_cur, v_next);

        v_iters := v_iters + 1;
        v_cur   := v_next;
    END LOOP;

    RETURN FORMAT('Particiones creadas/verificadas: %s meses.', v_iters);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, tickets, audit, notifications, maintenance;

-- ── modules.bootstrap_module [FIX-8] ─────────────────────────────────────────
-- Crea módulo completo de forma atómica. FIX-8: usa config.module_settings
-- en lugar de modules.config (DEPRECATED) para semillas de configuración.
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
    -- 1. Módulo [ISSUE-7] UPSERT: idempotente en re-runs
    INSERT INTO modules.modules (name, slug, description, type, is_active)
    VALUES (p_name, p_slug, p_description, 'helpdesk', true)
    ON CONFLICT (slug) DO UPDATE SET
        name        = EXCLUDED.name,
        description = COALESCE(EXCLUDED.description, modules.modules.description),
        is_active   = EXCLUDED.is_active,
        updated_at  = now()
    RETURNING id INTO v_module_id;

    -- 2. Roles estándar [ISSUE-7] UPSERT: ON CONFLICT (module_id, name)
    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'usuario', 'Crea y sigue sus tickets', true)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_role_user;

    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'tecnico', 'Atiende tickets del módulo', true)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_role_tech;

    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'jefe_tecnico', 'Atiende tickets críticos/reproceso', true)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_role_chief;

    INSERT INTO modules.module_roles (module_id, name, description, is_active)
    VALUES (v_module_id, 'admin_modulo', 'Configuración del módulo', true)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_role_admin;

    -- 3–5. Workflow FSM [ISSUE-7] Guard: no re-crear si ya existe (rompe FKs de tickets vivos)
    IF NOT EXISTS (
        SELECT 1 FROM tickets.workflow_versions
        WHERE  module_id = v_module_id AND version = 1
    ) THEN
        INSERT INTO tickets.workflow_versions (module_id, version, description, is_active)
        VALUES (v_module_id, 1, 'Workflow estándar v1', true)
        RETURNING id INTO v_wfv_id;

        -- 4. Estados del FSM
        INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
        VALUES (v_wfv_id, v_module_id, 'abierto',    'Abierto',    true,  false) RETURNING id INTO v_st_open;
        INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
        VALUES (v_wfv_id, v_module_id, 'en_proceso', 'En proceso', false, false) RETURNING id INTO v_st_process;
        INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
        VALUES (v_wfv_id, v_module_id, 'en_espera',  'En espera',  false, false) RETURNING id INTO v_st_wait;
        INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
        VALUES (v_wfv_id, v_module_id, 'realizado',  'Realizado',  false, false) RETURNING id INTO v_st_done;
        INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
        VALUES (v_wfv_id, v_module_id, 'reproceso',  'Reproceso',  false, false) RETURNING id INTO v_st_reprocess;
        INSERT INTO tickets.states (workflow_version_id, module_id, name, label, is_initial, is_final)
        VALUES (v_wfv_id, v_module_id, 'cerrado',    'Cerrado',    false, true)  RETURNING id INTO v_st_closed;

        -- 5. Transiciones FSM
        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
        VALUES (v_wfv_id, v_module_id, v_st_open,      v_st_process,   'Tomar ticket');
        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
        VALUES (v_wfv_id, v_module_id, v_st_process,   v_st_wait,      'Solicitar información');
        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
        VALUES (v_wfv_id, v_module_id, v_st_process,   v_st_done,      'Marcar realizado');
        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
        VALUES (v_wfv_id, v_module_id, v_st_wait,      v_st_process,   'Reanudar');
        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
        VALUES (v_wfv_id, v_module_id, v_st_done,      v_st_closed,    'Aprobar y cerrar');
        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
        VALUES (v_wfv_id, v_module_id, v_st_done,      v_st_reprocess, 'Rechazar solución');
        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name)
        VALUES (v_wfv_id, v_module_id, v_st_reprocess, v_st_process,   'Retomar para reproceso');
    ELSE
        SELECT id INTO v_wfv_id
        FROM   tickets.workflow_versions
        WHERE  module_id = v_module_id AND version = 1;
        RAISE NOTICE '[bootstrap_module] Workflow v1 de % ya existe, saltando FSM seed', p_name;
    END IF;

    -- 6. Política de asignación por defecto [ISSUE-7] ON CONFLICT DO NOTHING (ya es idempotente)
    INSERT INTO tickets.assignment_policies
        (module_id, use_specialists, use_generalists,
         specialist_overflow_enabled, specialist_overflow_threshold,
         assignment_method)
    VALUES (v_module_id, true, true, true, 5, 'round_robin')
    ON CONFLICT (module_id) DO NOTHING;

    -- 7. [FIX-8] Configuración dinámica → config.module_settings (NO modules.config)
    INSERT INTO config.module_settings
        (module_id, key, value, value_type, is_active, description)
    VALUES
    (v_module_id, 'ticket_flow',
        jsonb_build_object(
            'reproceso_max', 1,
            'auto_close_hours', 48,
            'digital_signature_required', true,
            'allow_user_create', true
        )::TEXT,
        'json', true, 'Configuración del flujo de tickets'),
    (v_module_id, 'queue_config',
        jsonb_build_object(
            'max_tickets_per_technician', 10,
            'priority_order', jsonb_build_array('critica','alta','media','baja'),
            'day_split', true
        )::TEXT,
        'json', true, 'Configuración de cola de asignación')
    ON CONFLICT (module_id, key, version) DO NOTHING;

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
    RAISE EXCEPTION '[bootstrap_module] Fallo al crear módulo "%": % — SQLSTATE: %',
        p_name, SQLERRM, SQLSTATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, modules, tickets, config, app;

COMMENT ON FUNCTION modules.bootstrap_module IS
    '[FIX-8 + ISSUE-7] Crea módulo completo atómico: módulo, 4 roles, workflow FSM
     (6 estados, 7 transiciones), política de asignación, seeds en config.module_settings.
     IDEMPOTENTE en re-runs: UPSERT en modules+module_roles, guard IF NOT EXISTS en
     workflow/states/transitions (no re-crea FSM si ya existen tickets vivos).
     En caso de fallo lanza EXCEPTION para rollback completo.';

-- ============================================================================
-- PARTE 20: VISTAS OPERACIONALES
-- ============================================================================

-- ── modules.v_available_technicians [FIX-10] ─────────────────────────────────
-- Bug corregido: GROUP BY eliminó ticket_id del paso intermedio.
-- Antes: tech_load agrupaba por (user_id, ticket_id, module_id) → active_count=1
-- siempre → tech_load_agg.SUM() siempre = cantidad de tickets, no carga real.
-- Ahora: CTE única agrupa directamente por (user_id, module_id) → COUNT() correcto.
CREATE OR REPLACE VIEW modules.v_available_technicians AS
WITH tech_load AS (
    SELECT
        ta.user_id,
        t.module_id,
        COUNT(*)::INT AS active_tickets
    FROM   tickets.ticket_assignments ta
    JOIN   tickets.tickets t ON t.id = ta.ticket_id
    WHERE  ta.is_active = true
    GROUP BY ta.user_id, t.module_id
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
    COALESCE(tl.active_tickets, 0)                AS active_tickets,
    la.last_assigned_at,
    ROW_NUMBER() OVER (
        PARTITION BY umr.module_id
        ORDER BY
            COALESCE(tl.active_tickets, 0) ASC,
            la.last_assigned_at            ASC NULLS FIRST
    )                                             AS round_robin_position
FROM   modules.user_module_roles  umr
JOIN   modules.module_roles       mr  ON mr.id        = umr.role_id
JOIN   users.profiles             p   ON p.id         = umr.user_id
LEFT JOIN modules.technician_status ts
    ON ts.user_id    = umr.user_id AND ts.module_id = umr.module_id
LEFT JOIN tech_load tl
    ON tl.user_id    = umr.user_id AND tl.module_id = umr.module_id
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
    '[FIX-10] CTE tech_load corregida: GROUP BY (user_id, module_id) directo,
     sin paso intermedio con ticket_id que producía active_count=1 siempre.
     round_robin_position=1 → próximo en recibir asignación.';

-- ── tickets.v_tickets_unified ─────────────────────────────────────────────────
CREATE OR REPLACE VIEW tickets.v_tickets_unified AS
SELECT
    t.id,
    t.module_id,
    m.name                                          AS module_name,
    m.slug                                          AS module_slug,
    t.environment_id,
    t.category_id,
    cat.name                                        AS category_name,
    t.created_by,
    p_creator.first_name || ' ' || p_creator.last_name AS created_by_name,
    t.priority,
    t.urgency,
    t.impact,
    t.current_state_id,
    st.name                                         AS current_state_name,
    st.label                                        AS current_state_label,
    t.sla_policy_id,
    t.sla_deadline,
    t.reprocess_count,
    t.version,
    t.title,
    t.description,
    t.created_at,
    t.updated_at,
    ta_owner.user_id                                AS assigned_to,
    p_tech.first_name || ' ' || p_tech.last_name   AS assigned_to_name,
    sla_track.status                                AS sla_status,
    sla_track.deadline_at                           AS sla_deadline_at,
    sla_track.breached_at                           AS sla_breached_at,
    CASE
        WHEN sla_track.deadline_at IS NOT NULL AND sla_track.breached_at IS NULL
        THEN EXTRACT(EPOCH FROM (sla_track.deadline_at - now())) / 3600.0
        ELSE NULL
    END                                             AS sla_remaining_hours,
    appr.status                                     AS approval_status,
    appr.expires_at                                 AS approval_expires_at,
    CASE DATE(t.created_at) WHEN CURRENT_DATE THEN 'today' ELSE 'previous' END
                                                    AS queue_group
FROM        tickets.tickets              t
LEFT JOIN   modules.modules              m          ON m.id         = t.module_id
LEFT JOIN   modules.categories           cat        ON cat.id       = t.category_id
LEFT JOIN   tickets.states               st         ON st.id        = t.current_state_id
LEFT JOIN   users.profiles               p_creator  ON p_creator.id = t.created_by
LEFT JOIN   tickets.ticket_assignments   ta_owner
    ON  ta_owner.ticket_id = t.id
    AND ta_owner.role = 'owner'
    AND ta_owner.is_active = true
LEFT JOIN   users.profiles               p_tech     ON p_tech.id    = ta_owner.user_id
LEFT JOIN   tickets.ticket_sla_tracking  sla_track  ON sla_track.ticket_id = t.id
LEFT JOIN   tickets.ticket_approvals     appr
    ON  appr.ticket_id = t.id
    AND appr.status    = 'pending';

-- ============================================================================
-- PARTE 21: ROW LEVEL SECURITY
-- En single-tenant el RLS controla acceso por ROL/MÓDULO.
-- [FIX-5] Idempotencia: DROP POLICY IF EXISTS antes de cada CREATE.
-- ============================================================================

-- ── modules.modules ───────────────────────────────────────────────────────────
ALTER TABLE modules.modules ENABLE ROW LEVEL SECURITY;

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

-- ── modules.assets ────────────────────────────────────────────────────────────
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
   SET search_path = pg_catalog, public, audit, app;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_modules
        AFTER INSERT OR UPDATE OR DELETE ON modules.modules
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_module_roles
        AFTER INSERT OR UPDATE OR DELETE ON modules.module_roles
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_inventory_assets
        AFTER INSERT OR UPDATE OR DELETE ON inventory.assets
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_ticket_assignments
        AFTER INSERT OR UPDATE OR DELETE ON tickets.ticket_assignments
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_assignment_policies
        AFTER INSERT OR UPDATE OR DELETE ON tickets.assignment_policies
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_auth_credentials
        AFTER INSERT OR UPDATE OR DELETE ON auth.credentials
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_users_profiles
        AFTER INSERT OR UPDATE OR DELETE ON users.profiles
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_sla_policies
        AFTER INSERT OR UPDATE OR DELETE ON tickets.sla_policies
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_sla_rules
        AFTER INSERT OR UPDATE OR DELETE ON tickets.sla_rules
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_audit_user_module_roles
        AFTER INSERT OR UPDATE OR DELETE ON modules.user_module_roles
        FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

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
$$ LANGUAGE plpgsql SECURITY DEFINER
   SET search_path = pg_catalog, public, reports;

-- ============================================================================
-- PARTE 24: DATOS INICIALES (SEEDS)
-- ============================================================================

-- Organización única (single-tenant)
INSERT INTO users.organizations (id, name, slug, timezone, language)
VALUES ('00000000-0000-0000-0000-000000000001',
        'Mi Empresa', 'mi-empresa', 'America/Bogota', 'es')
ON CONFLICT (id) DO NOTHING;

-- Roles globales del sistema: solo superadmin y usuario
-- is_superadmin flag controla acceso; global_role_id es solo etiqueta visual
DELETE FROM config.global_roles WHERE name NOT IN ('superadmin', 'usuario');

INSERT INTO config.global_roles (name, description) VALUES
    ('superadmin', 'Administrador global de la plataforma'),
    ('usuario',    'Usuario estándar del sistema')
ON CONFLICT (name) DO NOTHING;

-- Usuario superadmin por defecto — global_role_id apunta a 'superadmin' (solo visual)
INSERT INTO users.profiles (id, first_name, last_name, is_superadmin, is_active, global_role_id)
VALUES ('00000000-0000-0000-0000-000000000001',
        'Admin', 'Sistema', true, true,
        (SELECT id FROM config.global_roles WHERE name = 'superadmin'))
ON CONFLICT (id) DO UPDATE
    SET global_role_id = (SELECT id FROM config.global_roles WHERE name = 'superadmin');

-- Preferencias del superadmin
INSERT INTO users.preferences (user_id, language, timezone)
VALUES ('00000000-0000-0000-0000-000000000001', 'es', 'America/Bogota')
ON CONFLICT (user_id) DO NOTHING;

-- Configuración global del sistema [FIX-8] → app.settings (SYSTEM-LEVEL ONLY)
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
-- PARTE 24.5: TRIGGERS DE VALIDACIÓN CROSS-SCHEMA [BUG-1]
-- Creados DESPUÉS de seeds (superadmin ya existe en users.profiles).
-- Enforzan FK lógica cross-schema hacia users.profiles.id sin violar la regla
-- de FK cross-schema prohibida entre schemas.
-- ============================================================================

-- ── app.validate_user_exists [BUG-1] ─────────────────────────────────────────
-- Trigger genérico: previene INSERT/UPDATE con user_id que no exista o esté
-- soft-deleted en users.profiles. Acepta TG_ARGV[0] = nombre de columna a
-- validar (default 'user_id'). Lanza foreign_key_violation si no existe.
CREATE OR REPLACE FUNCTION app.validate_user_exists()
RETURNS TRIGGER AS $$
DECLARE
    v_field_name TEXT := COALESCE(TG_ARGV[0], 'user_id');
    v_user_id    UUID;
    v_exists     BOOLEAN;
BEGIN
    EXECUTE FORMAT('SELECT ($1).%I::UUID', v_field_name)
        USING NEW INTO v_user_id;

    IF v_user_id IS NULL THEN
        RETURN NEW;  -- NULL permitido; usar NOT NULL constraint para prohibirlo
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM users.profiles
        WHERE id = v_user_id AND deleted_at IS NULL
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION '[BUG-1] user_id % no existe en users.profiles o está eliminado (tabla: %.%, columna: %)',
            v_user_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, v_field_name
            USING ERRCODE = 'foreign_key_violation';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER
   SET search_path = pg_catalog, public, app, users;

COMMENT ON FUNCTION app.validate_user_exists IS
    '[BUG-1] Validador de FK lógica cross-schema hacia users.profiles.id.
     TG_ARGV[0] = nombre de columna a validar (default: user_id).
     Lanza foreign_key_violation si user_id no existe o está soft-deleted.
     Aplicado a: modules.user_module_roles (user_id, assigned_by)
                 tickets.ticket_assignments (user_id, assigned_by).';

-- Aplicar a modules.user_module_roles
DO $$ BEGIN
    CREATE TRIGGER trg_umr_validate_user_exists
        BEFORE INSERT OR UPDATE OF user_id ON modules.user_module_roles
        FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('user_id');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_umr_validate_assigned_by
        BEFORE INSERT OR UPDATE OF assigned_by ON modules.user_module_roles
        FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('assigned_by');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Aplicar a tickets.ticket_assignments (HASH-particionada: trigger en parent propaga)
DO $$ BEGIN
    CREATE TRIGGER trg_ta_validate_user_exists
        BEFORE INSERT OR UPDATE OF user_id ON tickets.ticket_assignments
        FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('user_id');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TRIGGER trg_ta_validate_assigned_by
        BEFORE INSERT OR UPDATE OF assigned_by ON tickets.ticket_assignments
        FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('assigned_by');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================================
-- PARTE 25: COMENTARIOS FINALES DE SCHEMAS
-- ============================================================================

COMMENT ON SCHEMA auth IS
    '[v6] Autenticación propia. credentials, refresh_tokens, sessions,
     token_revocation_list. Sin FK cross-schema: user_id = UUID lógico → users.profiles.id.';

COMMENT ON SCHEMA users IS
    '[v6] Perfiles y preferencias. SIN credenciales ni tokens.
     profiles.id == auth.credentials.user_id (relación lógica).
     is_superadmin = rol global que supera todos los roles de módulo.';

COMMENT ON SCHEMA config IS
    '[v6] Configuración dinámica (module_settings) y feature flags.
     module_id NULL = ámbito global. Fuente de verdad única — NO app.settings
     ni modules.config para nuevos desarrollos. [FIX-8]';

COMMENT ON SCHEMA modules IS
    '[v6] Módulos, ubicaciones, ambientes, categorías, roles, permisos.
     FK cross-schema PROHIBIDAS: user_id es UUID lógico.
     FK internas (mismo schema): normales.';

COMMENT ON SCHEMA tickets IS
    '[v6] Ciclo de vida completo del ticket.
     FSM configurable por módulo (workflow_versions → states → transitions).
     SLA data-driven + evaluate_sla_condition() IMMUTABLE [FIX-1].
     Asignación híbrida con round-robin real + ON CONFLICT RETURNING [FIX-4].
     tickets + ticket_comments: RANGE mensual. ticket_assignments: HASH(8) [FIX-9].';

COMMENT ON SCHEMA inventory IS
    '[v6] Activos físicos y su ciclo de vida.
     qr_code generado automáticamente. version para optimistic locking.
     asset_assignment_history INMUTABLE (sin updated_at) [FIX-7].';

COMMENT ON SCHEMA events IS
    '[v6] Outbox pattern. At-least-once delivery a RabbitMQ en Fase 2.
     En Fase 1 consumido por el mismo proceso.';

COMMENT ON SCHEMA audit IS
    '[v6] Log central INMUTABLE (sin updated_at) [FIX-7]. Solo INSERT.
     Particionado mensualmente.';

-- ============================================================================
-- [FIX-8] JOBS pg_cron (OPCIONAL — descomenta si pg_cron está disponible)
-- ============================================================================
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
--
-- SELECT cron.schedule('create-future-partitions', '0 2 * * 0',
--     'SELECT maintenance.create_future_partitions(6)');
--
-- SELECT cron.schedule('refresh-reports', '0 3 * * *',
--     'SELECT reports.refresh_all()');
--
-- SELECT cron.schedule('cleanup-temp-files', '0 * * * *',
--     'UPDATE files.files SET deleted_at = now()
--      WHERE is_confirmed = false AND expires_at < now() AND deleted_at IS NULL');
--
-- SELECT cron.schedule('process-expired-approvals', '*/15 * * * *',
--     'UPDATE tickets.ticket_approvals
--      SET status = ''expired''
--      WHERE status = ''pending'' AND expires_at < now()');

-- ============================================================================
-- PARTE 26: PATCH v6.1-patch-3 (2026-05-06 — Contexto del proyecto: perfil obligatorio)
-- Basado en CONTEXTO DEL PROYECTO.txt
-- ============================================================================

-- users.profiles: campos obligatorios de perfil + username para login dual
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS username         VARCHAR(100) NULL;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS address          TEXT         NULL;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS job_title        VARCHAR(150) NULL;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS department       VARCHAR(150) NULL;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS primary_sede     VARCHAR(200) NULL;
ALTER TABLE users.profiles ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN      NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username
    ON users.profiles(username) WHERE username IS NOT NULL AND deleted_at IS NULL;

-- Usuarios existentes ya tienen perfil completo (no bloquear acceso en migración)
UPDATE users.profiles SET profile_complete = true WHERE deleted_at IS NULL;

-- auth.credentials: contador de intentos fallidos de contraseña
ALTER TABLE auth.credentials ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0;

-- modules.modules: timestamp para hard-delete automático (90 días tras soft-delete)
ALTER TABLE modules.modules ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ NULL;

-- ============================================================================
-- PARTE 26.5: PATCH v6.1-patch-2 (2026-05-06 — Auth email OTP obligatorio)
-- Agrega columnas necesarias para el flujo de OTP unificado:
-- - auth.email_otp.attempts: contador de intentos fallidos por OTP
-- - auth.credentials.login_locked_until: timestamp de bloqueo temporal
-- ============================================================================

ALTER TABLE auth.email_otp ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
COMMENT ON COLUMN auth.email_otp.attempts IS
    'Intentos fallidos sobre este OTP. Máx 3 — al superarse se invalida el OTP y bloquea la cuenta 15 min.';

ALTER TABLE auth.credentials ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ NULL;
COMMENT ON COLUMN auth.credentials.login_locked_until IS
    'Bloqueo temporal por demasiados intentos OTP fallidos. NULL = sin bloqueo.';

-- ============================================================================
-- PARTE 27 — PATCH-4: requests schema + solicitudes administrativas
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS requests;

CREATE TABLE IF NOT EXISTS requests.admin_requests (
    id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id    UUID         NOT NULL REFERENCES users.profiles(id),
    type            VARCHAR(50)  NOT NULL CHECK (type IN (
        'role_change','module_access','info_correction','sede_change',
        'permission_adjustment','account_issue','reactivation','other'
    )),
    title           VARCHAR(200) NOT NULL,
    description     TEXT         NOT NULL,
    status          VARCHAR(20)  NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending','under_review','approved','rejected'
    )),
    reviewed_by     UUID         NULL REFERENCES users.profiles(id),
    reviewed_at     TIMESTAMPTZ  NULL,
    review_notes    TEXT         NULL,
    metadata        JSONB        NULL,
    created_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_requests_requester ON requests.admin_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status    ON requests.admin_requests(status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_type      ON requests.admin_requests(type);

-- modules.modules: retención 90 días tras soft-delete (ya añadido en PARTE 26.5)
-- Sólo garantizamos que el campo exista:
ALTER TABLE modules.modules ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ NULL;

-- ============================================================================
-- PARTE 28 — PATCH-5: Sistema de papelera unificado (2026-05-07)
-- ============================================================================

ALTER TABLE users.profiles
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ NULL;

ALTER TABLE config.global_roles
  ADD COLUMN IF NOT EXISTS deleted_at               TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ NULL;

ALTER TABLE requests.admin_requests
  ADD COLUMN IF NOT EXISTS deleted_at               TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS scheduled_hard_delete_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_global_roles_deleted    ON config.global_roles(deleted_at)           WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_admin_requests_deleted  ON requests.admin_requests(deleted_at)        WHERE deleted_at IS NULL;

-- ============================================================================
-- FIN DEL SCRIPT — v6.1 SINGLE-TENANT (VERSIÓN FINAL DEPLOYABLE)
-- ============================================================================