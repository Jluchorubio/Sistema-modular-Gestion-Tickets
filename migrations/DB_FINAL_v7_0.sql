-- ============================================================================
-- DB_FINAL_v7_0.sql — Schema maestro limpio
-- Sistema Modular de Gestión de Tickets
-- Generado desde Railway DB: 2026-05-17 | Versión: 7.0
--
-- Aplicar en DB vacía:
--   psql -d <db> -v ON_ERROR_STOP=1 -f DB_FINAL_v7_0.sql
--
-- Orden: Extensions → Schemas → ENUMs → Functions base → Tables →
--        Indexes → FKs → Functions dominio → Triggers → RLS →
--        Particiones → Views → Seeds base
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 0: Extensions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 1: Schemas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS calendar;
CREATE SCHEMA IF NOT EXISTS config;
CREATE SCHEMA IF NOT EXISTS events;
CREATE SCHEMA IF NOT EXISTS files;
CREATE SCHEMA IF NOT EXISTS inventory;
CREATE SCHEMA IF NOT EXISTS maintenance;
CREATE SCHEMA IF NOT EXISTS modules;
CREATE SCHEMA IF NOT EXISTS notifications;
CREATE SCHEMA IF NOT EXISTS reports;
CREATE SCHEMA IF NOT EXISTS requests;
CREATE SCHEMA IF NOT EXISTS tickets;
CREATE SCHEMA IF NOT EXISTS users;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: ENUMs (en public para disponibilidad cross-schema)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN CREATE TYPE action_type AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE actor_type AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE approval_status AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE asset_status AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE assignment_method AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE assignment_role AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE impact_level AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_channel AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE notification_status AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE outbox_status AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE priority_level AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE technician_type AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE urgency_level AS ENUM ();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 3: Función base set_updated_at
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 4: Funciones de contexto y dominio
-- ─────────────────────────────────────────────────────────────────────────────
-- app.get_current_module_id
CREATE OR REPLACE FUNCTION app.get_current_module_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $function$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_module_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END;
$function$;

-- app.get_current_organization_id
CREATE OR REPLACE FUNCTION app.get_current_organization_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $function$
BEGIN
    -- SINGLE-TENANT: UUID fijo. No es discriminador de aislamiento.
    RETURN '00000000-0000-0000-0000-000000000001'::UUID;
END;
$function$;

-- app.get_current_role
CREATE OR REPLACE FUNCTION app.get_current_role()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $function$
DECLARE v_role TEXT;
BEGIN
    BEGIN v_role := current_setting('app.current_role', true);
    EXCEPTION WHEN OTHERS THEN v_role := NULL; END;
    RETURN v_role;
END;
$function$;

-- app.get_current_user_id
CREATE OR REPLACE FUNCTION app.get_current_user_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $function$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END;
$function$;

-- app.has_module_permission
CREATE OR REPLACE FUNCTION app.has_module_permission(p_permission text, p_module_id uuid DEFAULT NULL::uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'modules'
AS $function$
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
$function$;

-- app.is_superadmin
CREATE OR REPLACE FUNCTION app.is_superadmin()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'users'
AS $function$
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
$function$;

-- app.validate_user_exists
CREATE OR REPLACE FUNCTION app.validate_user_exists()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'users'
AS $function$
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
$function$;

-- modules.bootstrap_module
CREATE OR REPLACE FUNCTION modules.bootstrap_module(p_organization_id uuid, p_name text, p_slug text, p_description text DEFAULT NULL::text, p_is_default boolean DEFAULT false, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'modules', 'tickets', 'config', 'app'
AS $function$
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
$function$;

-- tickets.assign_ticket_hybrid
CREATE OR REPLACE FUNCTION tickets.assign_ticket_hybrid(p_ticket_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'modules', 'events', 'app'
AS $function$
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
$function$;

-- tickets.evaluate_sla_condition
CREATE OR REPLACE FUNCTION tickets.evaluate_sla_condition(p_condition jsonb, p_context jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
$function$;

-- tickets.execute_transition
CREATE OR REPLACE FUNCTION tickets.execute_transition(p_ticket_id uuid, p_transition_id uuid, p_comment text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'events', 'app'
AS $function$
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
$function$;

-- tickets.fn_ticket_state_audit
CREATE OR REPLACE FUNCTION tickets.fn_ticket_state_audit()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'audit', 'app'
AS $function$
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
$function$;

-- tickets.fn_ticket_state_history
CREATE OR REPLACE FUNCTION tickets.fn_ticket_state_history()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'app'
AS $function$
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
$function$;

-- tickets.fn_ticket_version_bump
CREATE OR REPLACE FUNCTION tickets.fn_ticket_version_bump()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$function$;

-- tickets.fn_validate_ticket_coherence
CREATE OR REPLACE FUNCTION tickets.fn_validate_ticket_coherence()
 RETURNS trigger
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets'
AS $function$
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
$function$;

-- tickets.generate_approval_token
CREATE OR REPLACE FUNCTION tickets.generate_approval_token(p_ticket_id uuid, p_user_id uuid, p_hours integer DEFAULT 48)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'events'
AS $function$
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
$function$;

-- tickets.resolve_sla
CREATE OR REPLACE FUNCTION tickets.resolve_sla(p_module_id uuid, p_category_id uuid DEFAULT NULL::uuid, p_environment_id uuid DEFAULT NULL::uuid, p_urgency urgency_level DEFAULT NULL::urgency_level, p_impact impact_level DEFAULT NULL::impact_level)
 RETURNS TABLE(policy_id uuid, rule_id uuid, priority_result priority_level, resolution_time_hours integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets'
AS $function$
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
$function$;

-- reports.refresh_all
CREATE OR REPLACE FUNCTION reports.refresh_all()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reports'
AS $function$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY reports.technician_load;
    RETURN 'Vistas materializadas actualizadas: ' || now()::TEXT;
END;
$function$;

-- audit.log_entity_changes
CREATE OR REPLACE FUNCTION audit.log_entity_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'audit', 'app'
AS $function$
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
$function$;

-- inventory.fn_asset_version_bump
CREATE OR REPLACE FUNCTION inventory.fn_asset_version_bump()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    NEW.version := OLD.version + 1;
    RETURN NEW;
END;
$function$;

-- inventory.fn_assets_generate_qr
CREATE OR REPLACE FUNCTION inventory.fn_assets_generate_qr()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.qr_code IS NULL OR NEW.qr_code = '' THEN
        NEW.qr_code := 'QR-' || gen_random_uuid()::TEXT;
    END IF;
    RETURN NEW;
END;
$function$;

-- maintenance.create_future_partitions
CREATE OR REPLACE FUNCTION maintenance.create_future_partitions(p_months_ahead integer DEFAULT 6)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'audit', 'notifications', 'maintenance'
AS $function$
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
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 5: Tablas (solo tablas padre + tablas normales)
-- ─────────────────────────────────────────────────────────────────────────────

-- users.organizations
CREATE TABLE IF NOT EXISTS users.organizations (
    id uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    name character varying(200) NOT NULL DEFAULT 'Mi Empresa'::character varying,
    slug character varying(100) NOT NULL DEFAULT 'mi-empresa'::character varying,
    timezone character varying(100) NOT NULL DEFAULT 'America/Bogota'::character varying,
    language character varying(10) NOT NULL DEFAULT 'es'::character varying,
    is_active boolean NOT NULL DEFAULT true,
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_organizations PRIMARY KEY (id),
    CONSTRAINT organizations_slug_key UNIQUE (slug)
);

-- users.preferences
CREATE TABLE IF NOT EXISTS users.preferences (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    language character varying(10) NOT NULL DEFAULT 'es'::character varying,
    timezone character varying(50) NOT NULL DEFAULT 'America/Bogota'::character varying,
    notification_email boolean NOT NULL DEFAULT true,
    notification_whatsapp boolean NOT NULL DEFAULT false,
    notification_in_app boolean NOT NULL DEFAULT true,
    ui_settings jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_preferences PRIMARY KEY (id),
    CONSTRAINT preferences_user_id_key UNIQUE (user_id)
);

-- users.profiles
CREATE TABLE IF NOT EXISTS users.profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    display_email character varying(255),
    phone character varying(30),
    avatar_url text,
    is_superadmin boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    global_role_id uuid,
    username character varying(100),
    address text,
    job_title character varying(150),
    department character varying(150),
    primary_sede character varying(200),
    profile_complete boolean NOT NULL DEFAULT false,
    scheduled_hard_delete_at timestamp with time zone,
    phone_prefix character varying(10),
    country character varying(100),
    state_province character varying(150),
    city character varying(150),
    birth_date date,
    national_id character varying(50),
    gender character varying(30),
    emergency_contact_name character varying(100),
    emergency_contact_phone character varying(50),
    last_seen_at timestamp with time zone,
    CONSTRAINT pk_profiles PRIMARY KEY (id),
    CONSTRAINT chk_profiles_gender CHECK (((gender)::text = ANY ((ARRAY['masculino'::character varying, 'femenino'::character varying, 'no_binario'::character varying, 'prefiero_no_decir'::character varying, 'otro'::character varying])::text[])))
);

-- config.feature_flags
CREATE TABLE IF NOT EXISTS config.feature_flags (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid,
    flag_key character varying(100) NOT NULL,
    is_enabled boolean NOT NULL DEFAULT false,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_feature_flags PRIMARY KEY (id),
    CONSTRAINT feature_flags_module_id_flag_key_key UNIQUE (module_id, flag_key)
);

-- config.global_roles
CREATE TABLE IF NOT EXISTS config.global_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name character varying(50) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    scheduled_hard_delete_at timestamp with time zone,
    CONSTRAINT pk_global_roles PRIMARY KEY (id),
    CONSTRAINT global_roles_name_key UNIQUE (name)
);

-- config.module_settings
CREATE TABLE IF NOT EXISTS config.module_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid,
    key character varying(100) NOT NULL,
    value text NOT NULL,
    value_type character varying(10) NOT NULL,
    description text,
    version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT true,
    deprecated_at timestamp with time zone,
    updated_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_module_settings PRIMARY KEY (id),
    CONSTRAINT module_settings_value_type_check CHECK (((value_type)::text = ANY ((ARRAY['string'::character varying, 'int'::character varying, 'bool'::character varying, 'json'::character varying])::text[])))
);

-- auth.credentials
CREATE TABLE IF NOT EXISTS auth.credentials (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    login_locked_until timestamp with time zone,
    failed_login_attempts integer NOT NULL DEFAULT 0,
    force_password_change boolean NOT NULL DEFAULT false,
    otp_enabled boolean NOT NULL DEFAULT false,
    CONSTRAINT pk_credentials PRIMARY KEY (id),
    CONSTRAINT credentials_email_key UNIQUE (email),
    CONSTRAINT credentials_user_id_key UNIQUE (user_id)
);

-- auth.email_otp
CREATE TABLE IF NOT EXISTS auth.email_otp (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    attempts integer NOT NULL DEFAULT 0,
    CONSTRAINT pk_email_otp PRIMARY KEY (id)
);

-- auth.mfa_settings
CREATE TABLE IF NOT EXISTS auth.mfa_settings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    totp_secret text,
    totp_enabled boolean NOT NULL DEFAULT false,
    totp_last_verified_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    email_otp_enabled boolean NOT NULL DEFAULT false,
    email_otp_last_verified_at timestamp with time zone,
    CONSTRAINT pk_mfa_settings PRIMARY KEY (id),
    CONSTRAINT mfa_settings_user_id_key UNIQUE (user_id)
);

-- auth.password_resets
CREATE TABLE IF NOT EXISTS auth.password_resets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_password_resets PRIMARY KEY (id),
    CONSTRAINT password_resets_token_hash_key UNIQUE (token_hash)
);

-- auth.refresh_tokens
CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

-- auth.sessions
CREATE TABLE IF NOT EXISTS auth.sessions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    ip_address inet,
    user_agent text,
    expires_at timestamp with time zone NOT NULL,
    ended_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    geo_city character varying(100),
    geo_country character varying(100),
    geo_country_code character(2),
    geo_lat numeric(8,5),
    geo_lon numeric(8,5),
    CONSTRAINT pk_sessions PRIMARY KEY (id)
);

-- auth.token_revocation_list
CREATE TABLE IF NOT EXISTS auth.token_revocation_list (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    jti uuid NOT NULL,
    user_id uuid NOT NULL,
    revoked_at timestamp with time zone NOT NULL DEFAULT now(),
    reason character varying(100),
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_token_revocation_list PRIMARY KEY (id),
    CONSTRAINT token_revocation_list_jti_key UNIQUE (jti)
);

-- modules.categories
CREATE TABLE IF NOT EXISTS modules.categories (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    parent_id uuid,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_categories PRIMARY KEY (id)
);

-- modules.environments
CREATE TABLE IF NOT EXISTS modules.environments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    location_id uuid NOT NULL,
    module_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_environments PRIMARY KEY (id)
);

-- modules.locations
CREATE TABLE IF NOT EXISTS modules.locations (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    address text,
    is_active boolean NOT NULL DEFAULT true,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_locations PRIMARY KEY (id)
);

-- modules.module_roles
CREATE TABLE IF NOT EXISTS modules.module_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_module_roles PRIMARY KEY (id),
    CONSTRAINT module_roles_module_id_name_key UNIQUE (module_id, name)
);

-- modules.modules
CREATE TABLE IF NOT EXISTS modules.modules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    name character varying(100) NOT NULL,
    slug character varying(100) NOT NULL,
    description text,
    type character varying(50) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    image_url text,
    scheduled_hard_delete_at timestamp with time zone,
    color character varying(20),
    maintenance_mode boolean NOT NULL DEFAULT false,
    maintenance_by uuid,
    maintenance_since timestamp with time zone,
    maintenance_message text,
    CONSTRAINT pk_modules PRIMARY KEY (id),
    CONSTRAINT modules_slug_key UNIQUE (slug)
);

-- modules.permissions
CREATE TABLE IF NOT EXISTS modules.permissions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    name character varying(150) NOT NULL,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    CONSTRAINT pk_permissions PRIMARY KEY (id),
    CONSTRAINT permissions_module_id_name_key UNIQUE (module_id, name)
);

-- modules.role_permissions
CREATE TABLE IF NOT EXISTS modules.role_permissions (
    role_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id)
);

-- modules.technician_assignment_log
CREATE TABLE IF NOT EXISTS modules.technician_assignment_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    module_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    assigned_by character varying(50) NOT NULL DEFAULT 'system'::character varying,
    assignment_order integer NOT NULL DEFAULT 0,
    category_slug character varying(100),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_assignment_log PRIMARY KEY (id),
    CONSTRAINT technician_assignment_log_assigned_by_check CHECK (((assigned_by)::text = ANY ((ARRAY['system'::character varying, 'admin'::character varying, 'manual'::character varying])::text[])))
);

-- modules.technician_status
CREATE TABLE IF NOT EXISTS modules.technician_status (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    module_id uuid NOT NULL,
    is_available boolean NOT NULL DEFAULT true,
    reason character varying(50),
    unavailable_from timestamp with time zone,
    unavailable_to timestamp with time zone,
    notes text,
    created_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    status character varying(30) NOT NULL DEFAULT 'disponible'::character varying,
    CONSTRAINT pk_technician_status PRIMARY KEY (id),
    CONSTRAINT technician_status_reason_check CHECK (((reason)::text = ANY ((ARRAY['vacation'::character varying, 'maternity_leave'::character varying, 'sick_leave'::character varying, 'training'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT technician_status_status_check CHECK (((status)::text = ANY ((ARRAY['disponible'::character varying, 'ocupado'::character varying, 'en_reunion'::character varying, 'fuera_horario'::character varying, 'ausente'::character varying, 'offline'::character varying])::text[]))),
    CONSTRAINT technician_status_user_id_module_id_key UNIQUE (user_id, module_id)
);

-- modules.user_module_roles
CREATE TABLE IF NOT EXISTS modules.user_module_roles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    module_id uuid NOT NULL,
    role_id uuid NOT NULL,
    assigned_by uuid NOT NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_user_module_roles PRIMARY KEY (id),
    CONSTRAINT user_module_roles_user_id_module_id_role_id_key UNIQUE (user_id, module_id, role_id)
);

-- inventory.asset_assignment_history
CREATE TABLE IF NOT EXISTS inventory.asset_assignment_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    asset_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by uuid NOT NULL,
    assignment_id uuid,
    action character varying(30) NOT NULL,
    reason text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_assignment_history PRIMARY KEY (id),
    CONSTRAINT asset_assignment_history_action_check CHECK (((action)::text = ANY ((ARRAY['asignado'::character varying, 'devuelto'::character varying, 'transferido'::character varying, 'dado_de_baja'::character varying, 'reparacion'::character varying])::text[])))
);

-- inventory.asset_assignments
CREATE TABLE IF NOT EXISTS inventory.asset_assignments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    asset_id uuid NOT NULL,
    user_id uuid NOT NULL,
    assigned_by uuid NOT NULL,
    request_id uuid,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    unassigned_at timestamp with time zone,
    status character varying(20) NOT NULL DEFAULT 'activo'::character varying,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_assignments PRIMARY KEY (id),
    CONSTRAINT asset_assignments_status_check CHECK (((status)::text = ANY ((ARRAY['activo'::character varying, 'devuelto'::character varying, 'transferido'::character varying])::text[])))
);

-- inventory.asset_procurement_requests
CREATE TABLE IF NOT EXISTS inventory.asset_procurement_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    requested_by uuid NOT NULL,
    category_id uuid NOT NULL,
    quantity integer NOT NULL,
    justification text NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
    approved_by uuid,
    approved_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_procurement_requests PRIMARY KEY (id),
    CONSTRAINT asset_procurement_requests_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT asset_procurement_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'fulfilled'::character varying])::text[])))
);

-- inventory.asset_relationships
CREATE TABLE IF NOT EXISTS inventory.asset_relationships (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    parent_asset_id uuid NOT NULL,
    child_asset_id uuid NOT NULL,
    relationship_type character varying(50) NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_relationships PRIMARY KEY (id),
    CONSTRAINT asset_relationships_parent_asset_id_child_asset_id_key UNIQUE (parent_asset_id, child_asset_id)
);

-- inventory.asset_requests
CREATE TABLE IF NOT EXISTS inventory.asset_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    user_id uuid NOT NULL,
    category_id uuid NOT NULL,
    subcategory_id uuid,
    description text,
    quantity integer NOT NULL DEFAULT 1,
    justification text NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_requests PRIMARY KEY (id),
    CONSTRAINT asset_requests_quantity_check CHECK ((quantity > 0)),
    CONSTRAINT asset_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'fulfilled'::character varying])::text[])))
);

-- inventory.assets
CREATE TABLE IF NOT EXISTS inventory.assets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    category_id uuid NOT NULL,
    parent_asset_id uuid,
    name character varying(255) NOT NULL,
    description text,
    specifications jsonb,
    qr_code character varying(100) NOT NULL,
    serial_number character varying(100),
    status asset_status NOT NULL DEFAULT 'disponible'::asset_status,
    version integer NOT NULL DEFAULT 1,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_assets PRIMARY KEY (id),
    CONSTRAINT assets_qr_code_key UNIQUE (qr_code)
);

-- inventory.ticket_assets
CREATE TABLE IF NOT EXISTS inventory.ticket_assets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_assets PRIMARY KEY (id),
    CONSTRAINT ticket_assets_ticket_id_asset_id_key UNIQUE (ticket_id, asset_id)
);

-- files.files
CREATE TABLE IF NOT EXISTS files.files (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    uploaded_by uuid NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    file_name character varying(255) NOT NULL,
    file_size bigint NOT NULL,
    mime_type character varying(100) NOT NULL,
    storage_url text NOT NULL,
    is_confirmed boolean NOT NULL DEFAULT false,
    expires_at timestamp with time zone,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_files PRIMARY KEY (id),
    CONSTRAINT files_file_size_check CHECK ((file_size > 0))
);

-- notifications.notification_logs
CREATE TABLE IF NOT EXISTS notifications.notification_logs (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    template_id uuid,
    event_type character varying(100) NOT NULL,
    channel notification_channel NOT NULL,
    status notification_status NOT NULL DEFAULT 'pending'::notification_status,
    payload jsonb NOT NULL,
    error_message text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_notification_logs PRIMARY KEY (id, created_at)
)
PARTITION BY RANGE (created_at);

-- notifications.notification_templates
CREATE TABLE IF NOT EXISTS notifications.notification_templates (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    event_type character varying(100) NOT NULL,
    channel notification_channel NOT NULL,
    subject character varying(255),
    template_body text NOT NULL,
    variables jsonb NOT NULL DEFAULT '[]'::jsonb,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_notification_templates PRIMARY KEY (id),
    CONSTRAINT notification_templates_event_type_channel_key UNIQUE (event_type, channel)
);

-- audit.event_log
CREATE TABLE IF NOT EXISTS audit.event_log (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    actor_id uuid,
    actor_type actor_type NOT NULL,
    action character varying(100) NOT NULL,
    entity_type character varying(50) NOT NULL,
    entity_id uuid NOT NULL,
    old_value jsonb,
    new_value jsonb,
    ip_address inet,
    user_agent text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_event_log PRIMARY KEY (id, created_at)
)
PARTITION BY RANGE (created_at);

-- events.outbox
CREATE TABLE IF NOT EXISTS events.outbox (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    aggregate_type character varying(50) NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status outbox_status NOT NULL DEFAULT 'pending'::outbox_status,
    retries smallint NOT NULL DEFAULT 0,
    last_error text,
    scheduled_at timestamp with time zone NOT NULL DEFAULT now(),
    processed_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_outbox PRIMARY KEY (id)
);

-- requests.admin_requests
CREATE TABLE IF NOT EXISTS requests.admin_requests (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    requester_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    title character varying(200) NOT NULL,
    description text NOT NULL,
    status character varying(20) NOT NULL DEFAULT 'pending'::character varying,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    review_notes text,
    metadata jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    deleted_at timestamp with time zone,
    scheduled_hard_delete_at timestamp with time zone,
    priority character varying(20) NOT NULL DEFAULT 'media'::character varying,
    taken_at timestamp with time zone,
    taken_by uuid,
    sla_due_at timestamp with time zone,
    task_source character varying(20) NOT NULL DEFAULT 'user'::character varying,
    escalated boolean NOT NULL DEFAULT false,
    escalated_by uuid,
    escalated_at timestamp with time zone,
    escalation_note text,
    CONSTRAINT pk_admin_requests PRIMARY KEY (id),
    CONSTRAINT admin_requests_priority_check CHECK (((priority)::text = ANY ((ARRAY['baja'::character varying, 'media'::character varying, 'alta'::character varying, 'critica'::character varying])::text[]))),
    CONSTRAINT admin_requests_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'taken'::character varying, 'in_progress'::character varying, 'completed'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'under_review'::character varying, 'approved'::character varying])::text[]))),
    CONSTRAINT admin_requests_type_check CHECK (((type)::text = ANY (ARRAY['role_change'::text, 'module_access'::text, 'info_correction'::text, 'sede_change'::text, 'permission_adjustment'::text, 'account_issue'::text, 'reactivation'::text, 'other'::text, 'task'::text]))),
    CONSTRAINT chk_requests_task_source CHECK (((task_source)::text = ANY ((ARRAY['user'::character varying, 'system'::character varying])::text[])))
);

-- requests.request_timeline
CREATE TABLE IF NOT EXISTS requests.request_timeline (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    request_id uuid NOT NULL,
    actor_id uuid NOT NULL,
    action character varying(50) NOT NULL,
    old_status character varying(20),
    new_status character varying(20),
    notes text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_request_timeline PRIMARY KEY (id)
);

-- calendar.event_participants
CREATE TABLE IF NOT EXISTS calendar.event_participants (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    event_id uuid NOT NULL,
    user_id uuid,
    role_name character varying(50),
    module_id uuid,
    participant_type character varying(10) NOT NULL DEFAULT 'user'::character varying,
    status character varying(20) NOT NULL DEFAULT 'invited'::character varying,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_event_participants PRIMARY KEY (id),
    CONSTRAINT chk_ep_user_xor_role CHECK (((((participant_type)::text = 'user'::text) AND (user_id IS NOT NULL) AND (role_name IS NULL)) OR (((participant_type)::text = 'role'::text) AND (role_name IS NOT NULL) AND (user_id IS NULL)))),
    CONSTRAINT event_participants_participant_type_check CHECK (((participant_type)::text = ANY ((ARRAY['user'::character varying, 'role'::character varying])::text[]))),
    CONSTRAINT event_participants_status_check CHECK (((status)::text = ANY ((ARRAY['invited'::character varying, 'accepted'::character varying, 'declined'::character varying])::text[])))
);

-- calendar.events
CREATE TABLE IF NOT EXISTS calendar.events (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    title character varying(200) NOT NULL,
    description text,
    event_type character varying(20) NOT NULL DEFAULT 'personal'::character varying,
    visibility character varying(20) NOT NULL DEFAULT 'private'::character varying,
    module_id uuid,
    created_by uuid NOT NULL,
    ticket_id uuid,
    request_id uuid,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    all_day boolean NOT NULL DEFAULT false,
    priority priority_level NOT NULL DEFAULT 'media'::priority_level,
    status character varying(20) NOT NULL DEFAULT 'active'::character varying,
    color character varying(20),
    source character varying(20) NOT NULL DEFAULT 'manual'::character varying,
    created_via character varying(20) NOT NULL DEFAULT 'manual'::character varying,
    recurrence_rule text,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_events PRIMARY KEY (id),
    CONSTRAINT chk_cal_end_after_start CHECK ((end_at >= start_at)),
    CONSTRAINT events_created_via_check CHECK (((created_via)::text = ANY ((ARRAY['manual'::character varying, 'ticket_auto'::character varying, 'sla_auto'::character varying, 'request_auto'::character varying, 'meeting_auto'::character varying])::text[]))),
    CONSTRAINT events_event_type_check CHECK (((event_type)::text = ANY ((ARRAY['personal'::character varying, 'module'::character varying, 'global'::character varying])::text[]))),
    CONSTRAINT events_source_check CHECK (((source)::text = ANY ((ARRAY['manual'::character varying, 'ticket'::character varying, 'request'::character varying, 'sla'::character varying, 'system'::character varying, 'meeting'::character varying])::text[]))),
    CONSTRAINT events_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[]))),
    CONSTRAINT events_visibility_check CHECK (((visibility)::text = ANY ((ARRAY['private'::character varying, 'module'::character varying, 'participants'::character varying, 'global'::character varying])::text[])))
);

-- tickets.assignment_policies
CREATE TABLE IF NOT EXISTS tickets.assignment_policies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    use_specialists boolean NOT NULL DEFAULT true,
    use_generalists boolean NOT NULL DEFAULT true,
    specialist_overflow_enabled boolean NOT NULL DEFAULT true,
    specialist_overflow_threshold integer NOT NULL DEFAULT 5,
    assignment_method assignment_method NOT NULL DEFAULT 'round_robin'::assignment_method,
    updated_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_assignment_policies PRIMARY KEY (id),
    CONSTRAINT assignment_policies_module_id_key UNIQUE (module_id)
);

-- tickets.meeting_participants
CREATE TABLE IF NOT EXISTS tickets.meeting_participants (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    meeting_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(20) NOT NULL DEFAULT 'attendee'::character varying,
    joined_at timestamp with time zone,
    left_at timestamp with time zone,
    CONSTRAINT pk_meeting_participants PRIMARY KEY (id),
    CONSTRAINT meeting_participants_role_check CHECK (((role)::text = ANY ((ARRAY['host'::character varying, 'attendee'::character varying, 'observer'::character varying])::text[])))
);

-- tickets.sla_conditions
CREATE TABLE IF NOT EXISTS tickets.sla_conditions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    rule_id uuid NOT NULL,
    field character varying(100) NOT NULL,
    operator character varying(10) NOT NULL,
    value text NOT NULL,
    logical_group integer NOT NULL,
    order_index integer NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_sla_conditions PRIMARY KEY (id),
    CONSTRAINT sla_conditions_operator_check CHECK (((operator)::text = ANY ((ARRAY['='::character varying, '!='::character varying, '>'::character varying, '<'::character varying, '>='::character varying, '<='::character varying, 'IN'::character varying])::text[])))
);

-- tickets.sla_policies
CREATE TABLE IF NOT EXISTS tickets.sla_policies (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    version integer NOT NULL DEFAULT 1,
    is_active boolean NOT NULL DEFAULT false,
    deprecated_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_sla_policies PRIMARY KEY (id),
    CONSTRAINT sla_policies_module_id_name_version_key UNIQUE (module_id, name, version)
);

-- tickets.sla_rules
CREATE TABLE IF NOT EXISTS tickets.sla_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL,
    priority_result priority_level NOT NULL,
    resolution_time_hours integer NOT NULL,
    rule_order integer NOT NULL,
    valid_from timestamp with time zone,
    valid_until timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_sla_rules PRIMARY KEY (id),
    CONSTRAINT sla_rules_resolution_time_hours_check CHECK ((resolution_time_hours > 0))
);

-- tickets.states
CREATE TABLE IF NOT EXISTS tickets.states (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL,
    module_id uuid NOT NULL,
    name character varying(50) NOT NULL,
    label character varying(100) NOT NULL,
    is_initial boolean NOT NULL DEFAULT false,
    is_final boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,
    deprecated_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_states PRIMARY KEY (id)
);

-- tickets.technician_availability
CREATE TABLE IF NOT EXISTS tickets.technician_availability (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    module_id uuid NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_availability PRIMARY KEY (id),
    CONSTRAINT technician_availability_day_of_week_check CHECK (((day_of_week >= 0) AND (day_of_week <= 6)))
);

-- tickets.technician_category_skills
CREATE TABLE IF NOT EXISTS tickets.technician_category_skills (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    module_id uuid NOT NULL,
    category_id uuid NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_category_skills PRIMARY KEY (id),
    CONSTRAINT technician_category_skills_user_id_module_id_category_id_key UNIQUE (user_id, module_id, category_id)
);

-- tickets.technician_leaves
CREATE TABLE IF NOT EXISTS tickets.technician_leaves (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text,
    approved_by uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_leaves PRIMARY KEY (id),
    CONSTRAINT uq_tech_leaves_no_overlap EXCLUDE USING gist (user_id WITH =, daterange(start_date, end_date, '[]'::text) WITH &&)
);

-- tickets.technician_profiles
CREATE TABLE IF NOT EXISTS tickets.technician_profiles (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL,
    module_id uuid NOT NULL,
    technician_type technician_type NOT NULL DEFAULT 'generalist'::technician_type,
    max_daily_tickets integer,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_profiles PRIMARY KEY (id),
    CONSTRAINT technician_profiles_user_id_module_id_key UNIQUE (user_id, module_id)
);

-- tickets.ticket_approvals
CREATE TABLE IF NOT EXISTS tickets.ticket_approvals (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    user_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    status approval_status NOT NULL DEFAULT 'pending'::approval_status,
    signature_hash text,
    ip_address inet,
    user_agent text,
    approved_at timestamp with time zone,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_approvals PRIMARY KEY (id),
    CONSTRAINT ticket_approvals_token_key UNIQUE (token)
);

-- tickets.ticket_assignment_counters
CREATE TABLE IF NOT EXISTS tickets.ticket_assignment_counters (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    category_id uuid,
    technician_type technician_type NOT NULL DEFAULT 'generalist'::technician_type,
    last_assigned_user_id uuid,
    assignment_count bigint NOT NULL DEFAULT 0,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_assignment_counters PRIMARY KEY (id)
);

-- tickets.ticket_assignments
CREATE TABLE IF NOT EXISTS tickets.ticket_assignments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role assignment_role NOT NULL,
    assigned_by uuid NOT NULL,
    assigned_at timestamp with time zone NOT NULL DEFAULT now(),
    unassigned_at timestamp with time zone,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_assignments PRIMARY KEY (id, ticket_id)
)
PARTITION BY HASH (ticket_id);

-- tickets.ticket_comments
CREATE TABLE IF NOT EXISTS tickets.ticket_comments (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    user_id uuid NOT NULL,
    comment_type character varying(20) NOT NULL,
    content text NOT NULL,
    attachments jsonb,
    deleted_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_comments PRIMARY KEY (id, created_at),
    CONSTRAINT ticket_comments_comment_type_check CHECK (((comment_type)::text = ANY ((ARRAY['internal'::character varying, 'public'::character varying])::text[])))
)
PARTITION BY RANGE (created_at);

-- tickets.ticket_meetings
CREATE TABLE IF NOT EXISTS tickets.ticket_meetings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    module_id uuid NOT NULL,
    created_by uuid NOT NULL,
    provider character varying(20) NOT NULL DEFAULT 'google_meet'::character varying,
    meeting_url text,
    external_meeting_id character varying(200),
    status character varying(20) NOT NULL DEFAULT 'scheduled'::character varying,
    reason text,
    scheduled_at timestamp with time zone NOT NULL,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    duration_minutes integer,
    calendar_event_id uuid,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_meetings PRIMARY KEY (id),
    CONSTRAINT ticket_meetings_provider_check CHECK (((provider)::text = ANY ((ARRAY['google_meet'::character varying, 'teams'::character varying, 'zoom'::character varying, 'internal'::character varying])::text[]))),
    CONSTRAINT ticket_meetings_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'active'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);

-- tickets.ticket_ratings
CREATE TABLE IF NOT EXISTS tickets.ticket_ratings (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    rated_by uuid NOT NULL,
    technician_id uuid NOT NULL,
    score_attention smallint,
    score_clarity smallint,
    score_response_time smallint,
    score_quality smallint,
    score_overall smallint,
    service_label character varying(20),
    comment text,
    would_recommend boolean,
    resolved_on_first_attempt boolean,
    expires_at timestamp with time zone NOT NULL,
    is_expired boolean NOT NULL DEFAULT false,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_ratings PRIMARY KEY (id),
    CONSTRAINT ticket_ratings_score_attention_check CHECK (((score_attention >= 1) AND (score_attention <= 5))),
    CONSTRAINT ticket_ratings_score_clarity_check CHECK (((score_clarity >= 1) AND (score_clarity <= 5))),
    CONSTRAINT ticket_ratings_score_overall_check CHECK (((score_overall >= 1) AND (score_overall <= 5))),
    CONSTRAINT ticket_ratings_score_quality_check CHECK (((score_quality >= 1) AND (score_quality <= 5))),
    CONSTRAINT ticket_ratings_score_response_time_check CHECK (((score_response_time >= 1) AND (score_response_time <= 5))),
    CONSTRAINT ticket_ratings_service_label_check CHECK (((service_label)::text = ANY ((ARRAY['excelente'::character varying, 'bueno'::character varying, 'regular'::character varying, 'deficiente'::character varying])::text[]))),
    CONSTRAINT uq_ticket_ratings_ticket UNIQUE (ticket_id)
);

-- tickets.ticket_sla_tracking
CREATE TABLE IF NOT EXISTS tickets.ticket_sla_tracking (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    sla_policy_id uuid NOT NULL,
    sla_rule_id uuid NOT NULL,
    started_at timestamp with time zone NOT NULL,
    deadline_at timestamp with time zone NOT NULL,
    paused_at timestamp with time zone,
    resumed_at timestamp with time zone,
    breached_at timestamp with time zone,
    status character varying(20) NOT NULL DEFAULT 'active'::character varying,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_sla_tracking PRIMARY KEY (id),
    CONSTRAINT ticket_sla_tracking_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'paused'::character varying, 'met'::character varying, 'breached'::character varying])::text[]))),
    CONSTRAINT ticket_sla_tracking_ticket_id_key UNIQUE (ticket_id)
);

-- tickets.ticket_state_history
CREATE TABLE IF NOT EXISTS tickets.ticket_state_history (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    ticket_id uuid NOT NULL,
    from_state_id uuid NOT NULL,
    to_state_id uuid NOT NULL,
    transitioned_by uuid NOT NULL,
    transition_reason text,
    transitioned_at timestamp with time zone NOT NULL DEFAULT now(),
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_state_history PRIMARY KEY (id, transitioned_at)
)
PARTITION BY RANGE (transitioned_at);

-- tickets.tickets
CREATE TABLE IF NOT EXISTS tickets.tickets (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    workflow_version_id uuid NOT NULL,
    current_state_id uuid NOT NULL,
    environment_id uuid NOT NULL,
    category_id uuid NOT NULL,
    created_by uuid NOT NULL,
    priority priority_level NOT NULL DEFAULT 'media'::priority_level,
    urgency urgency_level NOT NULL DEFAULT 'media'::urgency_level,
    impact impact_level NOT NULL DEFAULT 'medio'::impact_level,
    sla_policy_id uuid NOT NULL,
    sla_deadline timestamp with time zone,
    reprocess_count integer NOT NULL DEFAULT 0,
    version integer NOT NULL DEFAULT 1,
    title character varying(255) NOT NULL,
    description text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_tickets PRIMARY KEY (id, created_at),
    CONSTRAINT tickets_reprocess_count_check CHECK ((reprocess_count <= 1))
)
PARTITION BY RANGE (created_at);

-- tickets.transition_rules
CREATE TABLE IF NOT EXISTS tickets.transition_rules (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    transition_id uuid NOT NULL,
    role_name character varying(50) NOT NULL,
    condition_expression text,
    action_type action_type NOT NULL,
    action_payload jsonb,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_transition_rules PRIMARY KEY (id)
);

-- tickets.transitions
CREATE TABLE IF NOT EXISTS tickets.transitions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL,
    module_id uuid NOT NULL,
    from_state_id uuid NOT NULL,
    to_state_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    version integer NOT NULL DEFAULT 1,
    deprecated_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_transitions PRIMARY KEY (id)
);

-- tickets.workflow_versions
CREATE TABLE IF NOT EXISTS tickets.workflow_versions (
    id uuid NOT NULL DEFAULT gen_random_uuid(),
    module_id uuid NOT NULL,
    version integer NOT NULL,
    description text,
    is_active boolean NOT NULL DEFAULT false,
    deprecated_at timestamp with time zone,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone NOT NULL DEFAULT now(),
    CONSTRAINT pk_workflow_versions PRIMARY KEY (id),
    CONSTRAINT workflow_versions_module_id_version_key UNIQUE (module_id, version)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 6: Indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit.event_log USING btree (actor_id) WHERE (actor_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit.event_log USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit.event_log USING btree (entity_type, entity_id);
CREATE UNIQUE INDEX IF NOT EXISTS credentials_email_key ON auth.credentials USING btree (email);
CREATE UNIQUE INDEX IF NOT EXISTS credentials_user_id_key ON auth.credentials USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_email ON auth.credentials USING btree (email);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_user_id ON auth.credentials USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_email_otp_lookup ON auth.email_otp USING btree (user_id, expires_at) WHERE (used_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_mfa_settings_user ON auth.mfa_settings USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS mfa_settings_user_id_key ON auth.mfa_settings USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_pr_token ON auth.password_resets USING btree (token_hash);
CREATE INDEX IF NOT EXISTS idx_pr_user ON auth.password_resets USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_lookup ON auth.password_resets USING btree (token_hash) WHERE (used_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS password_resets_token_hash_key ON auth.password_resets USING btree (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_rt_expires ON auth.refresh_tokens USING btree (expires_at) WHERE (revoked_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_auth_rt_token_hash ON auth.refresh_tokens USING btree (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_rt_user_id ON auth.refresh_tokens USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_refresh_tokens_hash ON auth.refresh_tokens USING btree (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires ON auth.sessions USING btree (expires_at) WHERE (ended_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON auth.sessions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_trl_expires_at ON auth.token_revocation_list USING btree (expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_trl_jti ON auth.token_revocation_list USING btree (jti);
CREATE UNIQUE INDEX IF NOT EXISTS token_revocation_list_jti_key ON auth.token_revocation_list USING btree (jti);
CREATE INDEX IF NOT EXISTS idx_cal_ep_event_id ON calendar.event_participants USING btree (event_id);
CREATE INDEX IF NOT EXISTS idx_cal_ep_role ON calendar.event_participants USING btree (role_name, module_id) WHERE (role_name IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cal_ep_user_id ON calendar.event_participants USING btree (user_id) WHERE (user_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cal_events_created_by ON calendar.events USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_cal_events_module_id ON calendar.events USING btree (module_id) WHERE (module_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cal_events_range_active ON calendar.events USING btree (start_at, end_at) WHERE ((deleted_at IS NULL) AND ((status)::text = 'active'::text));
CREATE INDEX IF NOT EXISTS idx_cal_events_request_id ON calendar.events USING btree (request_id) WHERE (request_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cal_events_start_at ON calendar.events USING btree (start_at);
CREATE INDEX IF NOT EXISTS idx_cal_events_ticket_id ON calendar.events USING btree (ticket_id) WHERE (ticket_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_cal_events_type_vis ON calendar.events USING btree (event_type, visibility) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS feature_flags_module_id_flag_key_key ON config.feature_flags USING btree (module_id, flag_key);
CREATE INDEX IF NOT EXISTS idx_config_flags_module ON config.feature_flags USING btree (module_id);
CREATE UNIQUE INDEX IF NOT EXISTS global_roles_name_key ON config.global_roles USING btree (name);
CREATE INDEX IF NOT EXISTS idx_config_settings_key ON config.module_settings USING btree (key) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_config_settings_module ON config.module_settings USING btree (module_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cms_scope ON config.module_settings USING btree (module_id, key, version) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_events_outbox_aggregate ON events.outbox USING btree (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_outbox_status_scheduled ON events.outbox USING btree (status, scheduled_at) WHERE (status = ANY (ARRAY['pending'::outbox_status, 'failed'::outbox_status]));
CREATE INDEX IF NOT EXISTS idx_files_entity ON files.files USING btree (entity_type, entity_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_files_temporary ON files.files USING btree (expires_at) WHERE ((is_confirmed = false) AND (deleted_at IS NULL));
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files.files USING btree (uploaded_by) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_inv_aah_asset ON inventory.asset_assignment_history USING btree (asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_aah_user ON inventory.asset_assignment_history USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_inv_ass_asset_status ON inventory.asset_assignments USING btree (asset_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_ass_user_status ON inventory.asset_assignments USING btree (user_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_proc_module_status ON inventory.asset_procurement_requests USING btree (module_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS asset_relationships_parent_asset_id_child_asset_id_key ON inventory.asset_relationships USING btree (parent_asset_id, child_asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_ar_child ON inventory.asset_relationships USING btree (child_asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_ar_parent ON inventory.asset_relationships USING btree (parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_req_module_status ON inventory.asset_requests USING btree (module_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_req_user_status ON inventory.asset_requests USING btree (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS assets_qr_code_key ON inventory.assets USING btree (qr_code);
CREATE INDEX IF NOT EXISTS idx_inventory_assets_category ON inventory.assets USING btree (category_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_inventory_assets_env_status ON inventory.assets USING btree (environment_id, status) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_inventory_assets_qr ON inventory.assets USING btree (qr_code);
CREATE INDEX IF NOT EXISTS idx_inventory_assets_status_active ON inventory.assets USING btree (status) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_inv_ta_asset ON inventory.ticket_assets USING btree (asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_ta_ticket ON inventory.ticket_assets USING btree (ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_assets_ticket_id_asset_id_key ON inventory.ticket_assets USING btree (ticket_id, asset_id);
CREATE INDEX IF NOT EXISTS idx_modules_categories_module_parent ON modules.categories USING btree (module_id, parent_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_modules_environments_location ON modules.environments USING btree (location_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_modules_environments_module ON modules.environments USING btree (module_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_modules_locations_module ON modules.locations USING btree (module_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_modules_roles_module ON modules.module_roles USING btree (module_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS module_roles_module_id_name_key ON modules.module_roles USING btree (module_id, name);
CREATE INDEX IF NOT EXISTS idx_modules_active ON modules.modules USING btree (is_active) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS modules_slug_key ON modules.modules USING btree (slug);
CREATE INDEX IF NOT EXISTS idx_modules_permissions_module ON modules.permissions USING btree (module_id) WHERE (deleted_at IS NULL);
CREATE UNIQUE INDEX IF NOT EXISTS permissions_module_id_name_key ON modules.permissions USING btree (module_id, name);
CREATE INDEX IF NOT EXISTS idx_assign_log_active ON modules.technician_assignment_log USING btree (module_id, user_id) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_assign_log_module ON modules.technician_assignment_log USING btree (module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_log_ticket ON modules.technician_assignment_log USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS idx_assign_log_user_module ON modules.technician_assignment_log USING btree (user_id, module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_tech_status_module ON modules.technician_status USING btree (module_id) WHERE (is_available = true);
CREATE INDEX IF NOT EXISTS idx_tech_status_period ON modules.technician_status USING btree (unavailable_from, unavailable_to) WHERE (is_available = false);
CREATE INDEX IF NOT EXISTS idx_tech_status_user_module ON modules.technician_status USING btree (user_id, module_id);
CREATE UNIQUE INDEX IF NOT EXISTS technician_status_user_id_module_id_key ON modules.technician_status USING btree (user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_umr_module_role ON modules.user_module_roles USING btree (module_id, role_id) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_umr_user_module ON modules.user_module_roles USING btree (user_id, module_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS user_module_roles_user_id_module_id_role_id_key ON modules.user_module_roles USING btree (user_id, module_id, role_id);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event_channel ON notifications.notification_logs USING btree (event_type, channel);
CREATE INDEX IF NOT EXISTS idx_notif_logs_user_status ON notifications.notification_logs USING btree (user_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_event_type_channel_key ON notifications.notification_templates USING btree (event_type, channel);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_tech_load_unique ON reports.technician_load USING btree (user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_admin_requests_escalated ON requests.admin_requests USING btree (escalated) WHERE (escalated = true);
CREATE INDEX IF NOT EXISTS idx_admin_requests_requester ON requests.admin_requests USING btree (requester_id);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status ON requests.admin_requests USING btree (status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_type ON requests.admin_requests USING btree (type);
CREATE INDEX IF NOT EXISTS idx_req_timeline_actor ON requests.request_timeline USING btree (actor_id);
CREATE INDEX IF NOT EXISTS idx_req_timeline_request ON requests.request_timeline USING btree (request_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS assignment_policies_module_id_key ON tickets.assignment_policies USING btree (module_id);
CREATE INDEX IF NOT EXISTS idx_mp_meeting_id ON tickets.meeting_participants USING btree (meeting_id);
CREATE INDEX IF NOT EXISTS idx_mp_user_id ON tickets.meeting_participants USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_conditions_rule_group ON tickets.sla_conditions USING btree (rule_id, logical_group, order_index);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_policies_module ON tickets.sla_policies USING btree (module_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS sla_policies_module_id_name_version_key ON tickets.sla_policies USING btree (module_id, name, version);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_rules_policy ON tickets.sla_rules USING btree (policy_id);
CREATE INDEX IF NOT EXISTS idx_tickets_states_wfv ON tickets.states USING btree (workflow_version_id) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_technician_availability_user_module_day ON tickets.technician_availability USING btree (user_id, module_id, day_of_week) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_tech_cat_skills_user_module_cat ON tickets.technician_category_skills USING btree (user_id, module_id, category_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS technician_category_skills_user_id_module_id_category_id_key ON tickets.technician_category_skills USING btree (user_id, module_id, category_id);
CREATE INDEX IF NOT EXISTS idx_technician_leaves_user_dates ON tickets.technician_leaves USING btree (user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS uq_tech_leaves_no_overlap ON tickets.technician_leaves USING gist (user_id, daterange(start_date, end_date, '[]'::text));
CREATE INDEX IF NOT EXISTS idx_tech_profiles_module_type ON tickets.technician_profiles USING btree (module_id, technician_type) WHERE (is_active = true);
CREATE INDEX IF NOT EXISTS idx_tech_profiles_user_module ON tickets.technician_profiles USING btree (user_id, module_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS technician_profiles_user_id_module_id_key ON tickets.technician_profiles USING btree (user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_status_expires ON tickets.ticket_approvals USING btree (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_ticket ON tickets.ticket_approvals USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_token ON tickets.ticket_approvals USING btree (token);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_approvals_token_key ON tickets.ticket_approvals USING btree (token);
CREATE INDEX IF NOT EXISTS idx_tac_module_env ON tickets.ticket_assignment_counters USING btree (module_id, environment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tac_pool ON tickets.ticket_assignment_counters USING btree (module_id, environment_id, category_id, technician_type) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_ta_ticket_active ON tickets.ticket_assignments USING btree (ticket_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_active ON tickets.ticket_assignments USING btree (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_role_active ON tickets.ticket_assignments USING btree (user_id, role, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ta_one_active_owner ON tickets.ticket_assignments USING btree (ticket_id) WHERE ((role = 'owner'::assignment_role) AND (is_active = true));
CREATE INDEX IF NOT EXISTS idx_tickets_comments_ticket ON tickets.ticket_comments USING btree (ticket_id) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_meetings_cal_event ON tickets.ticket_meetings USING btree (calendar_event_id) WHERE (calendar_event_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_meetings_created_by ON tickets.ticket_meetings USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_module_id ON tickets.ticket_meetings USING btree (module_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at ON tickets.ticket_meetings USING btree (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status ON tickets.ticket_meetings USING btree (status) WHERE ((status)::text = ANY ((ARRAY['scheduled'::character varying, 'active'::character varying])::text[]));
CREATE INDEX IF NOT EXISTS idx_meetings_ticket_id ON tickets.ticket_meetings USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ratings_expires_active ON tickets.ticket_ratings USING btree (expires_at) WHERE (is_expired = false);
CREATE INDEX IF NOT EXISTS idx_ratings_label ON tickets.ticket_ratings USING btree (service_label) WHERE (service_label IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ratings_rated_by ON tickets.ticket_ratings USING btree (rated_by);
CREATE INDEX IF NOT EXISTS idx_ratings_technician_id ON tickets.ticket_ratings USING btree (technician_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ticket_id ON tickets.ticket_ratings USING btree (ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ticket_ratings_ticket ON tickets.ticket_ratings USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_slat_status_deadline ON tickets.ticket_sla_tracking USING btree (status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_tickets_slat_ticket ON tickets.ticket_sla_tracking USING btree (ticket_id);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_sla_tracking_ticket_id_key ON tickets.ticket_sla_tracking USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_tsh_ticket_id ON tickets.ticket_state_history USING btree (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by ON tickets.tickets USING btree (created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_environment ON tickets.tickets USING btree (environment_id);
CREATE INDEX IF NOT EXISTS idx_tickets_id_lookup ON tickets.tickets USING btree (id);
CREATE INDEX IF NOT EXISTS idx_tickets_module_priority ON tickets.tickets USING btree (module_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_module_state ON tickets.tickets USING btree (module_id, current_state_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline ON tickets.tickets USING btree (sla_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_trules_transition ON tickets.transition_rules USING btree (transition_id);
CREATE INDEX IF NOT EXISTS idx_tickets_transitions_wfv_from ON tickets.transitions USING btree (workflow_version_id, from_state_id) WHERE (is_active = true);
CREATE UNIQUE INDEX IF NOT EXISTS workflow_versions_module_id_version_key ON tickets.workflow_versions USING btree (module_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_slug_key ON users.organizations USING btree (slug);
CREATE UNIQUE INDEX IF NOT EXISTS preferences_user_id_key ON users.preferences USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at ON users.profiles USING btree (last_seen_at) WHERE (last_seen_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_users_profiles_active ON users.profiles USING btree (is_active) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_users_profiles_deleted ON users.profiles USING btree (deleted_at) WHERE (deleted_at IS NULL);
CREATE INDEX IF NOT EXISTS idx_users_profiles_superadmin ON users.profiles USING btree (is_superadmin) WHERE ((is_superadmin = true) AND (deleted_at IS NULL));
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username ON users.profiles USING btree (username) WHERE ((username IS NOT NULL) AND (deleted_at IS NULL));

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 7: Foreign Keys
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE auth.email_otp ADD CONSTRAINT email_otp_user_id_fkey FOREIGN KEY (user_id) REFERENCES users.profiles(id) ON DELETE CASCADE;
ALTER TABLE calendar.event_participants ADD CONSTRAINT event_participants_event_id_fkey FOREIGN KEY (event_id) REFERENCES calendar.events(id) ON DELETE CASCADE;
ALTER TABLE inventory.asset_assignment_history ADD CONSTRAINT asset_assignment_history_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES inventory.assets(id) ON DELETE RESTRICT;
ALTER TABLE inventory.asset_assignments ADD CONSTRAINT asset_assignments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES inventory.assets(id) ON DELETE RESTRICT;
ALTER TABLE inventory.asset_relationships ADD CONSTRAINT asset_relationships_child_asset_id_fkey FOREIGN KEY (child_asset_id) REFERENCES inventory.assets(id) ON DELETE CASCADE;
ALTER TABLE inventory.asset_relationships ADD CONSTRAINT asset_relationships_parent_asset_id_fkey FOREIGN KEY (parent_asset_id) REFERENCES inventory.assets(id) ON DELETE CASCADE;
ALTER TABLE inventory.assets ADD CONSTRAINT assets_parent_asset_id_fkey FOREIGN KEY (parent_asset_id) REFERENCES inventory.assets(id) ON DELETE SET NULL;
ALTER TABLE inventory.ticket_assets ADD CONSTRAINT ticket_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES inventory.assets(id) ON DELETE RESTRICT;
ALTER TABLE modules.categories ADD CONSTRAINT categories_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.categories ADD CONSTRAINT categories_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES modules.categories(id) ON DELETE SET NULL;
ALTER TABLE modules.environments ADD CONSTRAINT environments_location_id_fkey FOREIGN KEY (location_id) REFERENCES modules.locations(id) ON DELETE CASCADE;
ALTER TABLE modules.environments ADD CONSTRAINT environments_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.locations ADD CONSTRAINT locations_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.module_roles ADD CONSTRAINT module_roles_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.modules ADD CONSTRAINT modules_maintenance_by_fkey FOREIGN KEY (maintenance_by) REFERENCES users.profiles(id) ON DELETE SET NULL;
ALTER TABLE modules.permissions ADD CONSTRAINT permissions_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.role_permissions ADD CONSTRAINT role_permissions_permission_id_fkey FOREIGN KEY (permission_id) REFERENCES modules.permissions(id) ON DELETE CASCADE;
ALTER TABLE modules.role_permissions ADD CONSTRAINT role_permissions_role_id_fkey FOREIGN KEY (role_id) REFERENCES modules.module_roles(id) ON DELETE CASCADE;
ALTER TABLE modules.technician_assignment_log ADD CONSTRAINT technician_assignment_log_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.technician_status ADD CONSTRAINT technician_status_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.user_module_roles ADD CONSTRAINT user_module_roles_module_id_fkey FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.user_module_roles ADD CONSTRAINT user_module_roles_role_id_fkey FOREIGN KEY (role_id) REFERENCES modules.module_roles(id) ON DELETE RESTRICT;
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_escalated_by_fkey FOREIGN KEY (escalated_by) REFERENCES users.profiles(id);
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES users.profiles(id);
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users.profiles(id);
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_taken_by_fkey FOREIGN KEY (taken_by) REFERENCES users.profiles(id) ON DELETE SET NULL;
ALTER TABLE requests.request_timeline ADD CONSTRAINT request_timeline_request_id_fkey FOREIGN KEY (request_id) REFERENCES requests.admin_requests(id) ON DELETE CASCADE;
ALTER TABLE tickets.meeting_participants ADD CONSTRAINT meeting_participants_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES tickets.ticket_meetings(id) ON DELETE CASCADE;
ALTER TABLE tickets.sla_conditions ADD CONSTRAINT sla_conditions_rule_id_fkey FOREIGN KEY (rule_id) REFERENCES tickets.sla_rules(id) ON DELETE CASCADE;
ALTER TABLE tickets.sla_rules ADD CONSTRAINT sla_rules_policy_id_fkey FOREIGN KEY (policy_id) REFERENCES tickets.sla_policies(id) ON DELETE CASCADE;
ALTER TABLE tickets.states ADD CONSTRAINT states_workflow_version_id_fkey FOREIGN KEY (workflow_version_id) REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE;
ALTER TABLE tickets.ticket_meetings ADD CONSTRAINT ticket_meetings_calendar_event_id_fkey FOREIGN KEY (calendar_event_id) REFERENCES calendar.events(id) ON DELETE SET NULL;
ALTER TABLE tickets.tickets ADD CONSTRAINT fk_tickets_current_state FOREIGN KEY (current_state_id) REFERENCES tickets.states(id) ON DELETE RESTRICT;
ALTER TABLE tickets.tickets ADD CONSTRAINT fk_tickets_sla_policy FOREIGN KEY (sla_policy_id) REFERENCES tickets.sla_policies(id) ON DELETE RESTRICT;
ALTER TABLE tickets.tickets ADD CONSTRAINT fk_tickets_workflow_version FOREIGN KEY (workflow_version_id) REFERENCES tickets.workflow_versions(id) ON DELETE RESTRICT;
ALTER TABLE tickets.transition_rules ADD CONSTRAINT transition_rules_transition_id_fkey FOREIGN KEY (transition_id) REFERENCES tickets.transitions(id) ON DELETE CASCADE;
ALTER TABLE tickets.transitions ADD CONSTRAINT transitions_from_state_id_fkey FOREIGN KEY (from_state_id) REFERENCES tickets.states(id) ON DELETE CASCADE;
ALTER TABLE tickets.transitions ADD CONSTRAINT transitions_to_state_id_fkey FOREIGN KEY (to_state_id) REFERENCES tickets.states(id) ON DELETE CASCADE;
ALTER TABLE tickets.transitions ADD CONSTRAINT transitions_workflow_version_id_fkey FOREIGN KEY (workflow_version_id) REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE;
ALTER TABLE users.preferences ADD CONSTRAINT preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES users.profiles(id) ON DELETE CASCADE;
ALTER TABLE users.profiles ADD CONSTRAINT profiles_global_role_id_fkey FOREIGN KEY (global_role_id) REFERENCES config.global_roles(id);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 8: Triggers
-- ─────────────────────────────────────────────────────────────────────────────
-- auth.credentials: trg_audit_auth_credentials
CREATE TRIGGER trg_audit_auth_credentials AFTER INSERT OR DELETE OR UPDATE ON auth.credentials FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- auth.credentials: trg_auth_credentials_updated_at
CREATE TRIGGER trg_auth_credentials_updated_at BEFORE UPDATE ON auth.credentials FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- auth.refresh_tokens: trg_auth_rt_updated_at
CREATE TRIGGER trg_auth_rt_updated_at BEFORE UPDATE ON auth.refresh_tokens FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- auth.sessions: trg_auth_sessions_updated_at
CREATE TRIGGER trg_auth_sessions_updated_at BEFORE UPDATE ON auth.sessions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- auth.token_revocation_list: trg_auth_trl_updated_at
CREATE TRIGGER trg_auth_trl_updated_at BEFORE UPDATE ON auth.token_revocation_list FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- calendar.events: trg_calendar_events_updated_at
CREATE TRIGGER trg_calendar_events_updated_at BEFORE UPDATE ON calendar.events FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- config.feature_flags: trg_config_flags_updated_at
CREATE TRIGGER trg_config_flags_updated_at BEFORE UPDATE ON config.feature_flags FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- config.module_settings: trg_config_settings_updated_at
CREATE TRIGGER trg_config_settings_updated_at BEFORE UPDATE ON config.module_settings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- events.outbox: trg_events_outbox_updated_at
CREATE TRIGGER trg_events_outbox_updated_at BEFORE UPDATE ON events.outbox FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- files.files: trg_files_updated_at
CREATE TRIGGER trg_files_updated_at BEFORE UPDATE ON files.files FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- inventory.asset_assignments: trg_asset_assignments_updated_at
CREATE TRIGGER trg_asset_assignments_updated_at BEFORE UPDATE ON inventory.asset_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- inventory.asset_procurement_requests: trg_procurement_updated_at
CREATE TRIGGER trg_procurement_updated_at BEFORE UPDATE ON inventory.asset_procurement_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- inventory.asset_relationships: trg_asset_relationships_updated_at
CREATE TRIGGER trg_asset_relationships_updated_at BEFORE UPDATE ON inventory.asset_relationships FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- inventory.asset_requests: trg_asset_requests_updated_at
CREATE TRIGGER trg_asset_requests_updated_at BEFORE UPDATE ON inventory.asset_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- inventory.assets: trg_asset_version_bump
CREATE TRIGGER trg_asset_version_bump BEFORE UPDATE ON inventory.assets FOR EACH ROW EXECUTE FUNCTION inventory.fn_asset_version_bump();

-- inventory.assets: trg_assets_generate_qr
CREATE TRIGGER trg_assets_generate_qr BEFORE INSERT ON inventory.assets FOR EACH ROW EXECUTE FUNCTION inventory.fn_assets_generate_qr();

-- inventory.assets: trg_assets_updated_at
CREATE TRIGGER trg_assets_updated_at BEFORE UPDATE ON inventory.assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- inventory.assets: trg_audit_inventory_assets
CREATE TRIGGER trg_audit_inventory_assets AFTER INSERT OR DELETE OR UPDATE ON inventory.assets FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- inventory.ticket_assets: trg_inv_ticket_assets_updated_at
CREATE TRIGGER trg_inv_ticket_assets_updated_at BEFORE UPDATE ON inventory.ticket_assets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.categories: trg_modules_categories_updated_at
CREATE TRIGGER trg_modules_categories_updated_at BEFORE UPDATE ON modules.categories FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.environments: trg_modules_environments_updated_at
CREATE TRIGGER trg_modules_environments_updated_at BEFORE UPDATE ON modules.environments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.locations: trg_modules_locations_updated_at
CREATE TRIGGER trg_modules_locations_updated_at BEFORE UPDATE ON modules.locations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.module_roles: trg_audit_module_roles
CREATE TRIGGER trg_audit_module_roles AFTER INSERT OR DELETE OR UPDATE ON modules.module_roles FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- modules.module_roles: trg_modules_roles_updated_at
CREATE TRIGGER trg_modules_roles_updated_at BEFORE UPDATE ON modules.module_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.modules: trg_audit_modules
CREATE TRIGGER trg_audit_modules AFTER INSERT OR DELETE OR UPDATE ON modules.modules FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- modules.modules: trg_modules_updated_at
CREATE TRIGGER trg_modules_updated_at BEFORE UPDATE ON modules.modules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.permissions: trg_modules_permissions_updated_at
CREATE TRIGGER trg_modules_permissions_updated_at BEFORE UPDATE ON modules.permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.role_permissions: trg_role_permissions_updated_at
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON modules.role_permissions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.technician_assignment_log: trg_tech_assign_log_updated_at
CREATE TRIGGER trg_tech_assign_log_updated_at BEFORE UPDATE ON modules.technician_assignment_log FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.technician_status: trg_tech_status_updated_at
CREATE TRIGGER trg_tech_status_updated_at BEFORE UPDATE ON modules.technician_status FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.user_module_roles: trg_audit_user_module_roles
CREATE TRIGGER trg_audit_user_module_roles AFTER INSERT OR DELETE OR UPDATE ON modules.user_module_roles FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- modules.user_module_roles: trg_umr_updated_at
CREATE TRIGGER trg_umr_updated_at BEFORE UPDATE ON modules.user_module_roles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules.user_module_roles: trg_umr_validate_assigned_by
CREATE TRIGGER trg_umr_validate_assigned_by BEFORE INSERT OR UPDATE OF assigned_by ON modules.user_module_roles FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('assigned_by');

-- modules.user_module_roles: trg_umr_validate_user_exists
CREATE TRIGGER trg_umr_validate_user_exists BEFORE INSERT OR UPDATE OF user_id ON modules.user_module_roles FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('user_id');

-- notifications.notification_logs: trg_notif_logs_updated_at
CREATE TRIGGER trg_notif_logs_updated_at BEFORE UPDATE ON notifications.notification_logs FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- notifications.notification_templates: trg_notif_templates_updated_at
CREATE TRIGGER trg_notif_templates_updated_at BEFORE UPDATE ON notifications.notification_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.assignment_policies: trg_assignment_policies_updated_at
CREATE TRIGGER trg_assignment_policies_updated_at BEFORE UPDATE ON tickets.assignment_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.assignment_policies: trg_audit_assignment_policies
CREATE TRIGGER trg_audit_assignment_policies AFTER INSERT OR DELETE OR UPDATE ON tickets.assignment_policies FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- tickets.sla_conditions: trg_sla_conditions_updated_at
CREATE TRIGGER trg_sla_conditions_updated_at BEFORE UPDATE ON tickets.sla_conditions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.sla_policies: trg_audit_sla_policies
CREATE TRIGGER trg_audit_sla_policies AFTER INSERT OR DELETE OR UPDATE ON tickets.sla_policies FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- tickets.sla_policies: trg_sla_policies_updated_at
CREATE TRIGGER trg_sla_policies_updated_at BEFORE UPDATE ON tickets.sla_policies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.sla_rules: trg_audit_sla_rules
CREATE TRIGGER trg_audit_sla_rules AFTER INSERT OR DELETE OR UPDATE ON tickets.sla_rules FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- tickets.sla_rules: trg_sla_rules_updated_at
CREATE TRIGGER trg_sla_rules_updated_at BEFORE UPDATE ON tickets.sla_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.states: trg_states_updated_at
CREATE TRIGGER trg_states_updated_at BEFORE UPDATE ON tickets.states FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.technician_availability: trg_tech_availability_updated_at
CREATE TRIGGER trg_tech_availability_updated_at BEFORE UPDATE ON tickets.technician_availability FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.technician_category_skills: trg_tech_skills_updated_at
CREATE TRIGGER trg_tech_skills_updated_at BEFORE UPDATE ON tickets.technician_category_skills FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.technician_leaves: trg_tech_leaves_updated_at
CREATE TRIGGER trg_tech_leaves_updated_at BEFORE UPDATE ON tickets.technician_leaves FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.technician_profiles: trg_tech_profiles_updated_at
CREATE TRIGGER trg_tech_profiles_updated_at BEFORE UPDATE ON tickets.technician_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.ticket_approvals: trg_ticket_approvals_updated_at
CREATE TRIGGER trg_ticket_approvals_updated_at BEFORE UPDATE ON tickets.ticket_approvals FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.ticket_assignment_counters: trg_tac_updated_at
CREATE TRIGGER trg_tac_updated_at BEFORE UPDATE ON tickets.ticket_assignment_counters FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.ticket_assignments: trg_audit_ticket_assignments
CREATE TRIGGER trg_audit_ticket_assignments AFTER INSERT OR DELETE OR UPDATE ON tickets.ticket_assignments FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- tickets.ticket_assignments: trg_ta_updated_at
CREATE TRIGGER trg_ta_updated_at BEFORE UPDATE ON tickets.ticket_assignments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.ticket_assignments: trg_ta_validate_assigned_by
CREATE TRIGGER trg_ta_validate_assigned_by BEFORE INSERT OR UPDATE OF assigned_by ON tickets.ticket_assignments FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('assigned_by');

-- tickets.ticket_assignments: trg_ta_validate_user_exists
CREATE TRIGGER trg_ta_validate_user_exists BEFORE INSERT OR UPDATE OF user_id ON tickets.ticket_assignments FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('user_id');

-- tickets.ticket_comments: trg_ticket_comments_updated_at
CREATE TRIGGER trg_ticket_comments_updated_at BEFORE UPDATE ON tickets.ticket_comments FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.ticket_meetings: trg_ticket_meetings_updated_at
CREATE TRIGGER trg_ticket_meetings_updated_at BEFORE UPDATE ON tickets.ticket_meetings FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.ticket_sla_tracking: trg_sla_tracking_updated_at
CREATE TRIGGER trg_sla_tracking_updated_at BEFORE UPDATE ON tickets.ticket_sla_tracking FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.tickets: trg_ticket_coherence
CREATE TRIGGER trg_ticket_coherence BEFORE INSERT ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.fn_validate_ticket_coherence();

-- tickets.tickets: trg_ticket_state_audit
CREATE TRIGGER trg_ticket_state_audit AFTER UPDATE OF current_state_id ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_audit();

-- tickets.tickets: trg_ticket_state_history
CREATE TRIGGER trg_ticket_state_history AFTER UPDATE OF current_state_id ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_history();

-- tickets.tickets: trg_ticket_updated_at
CREATE TRIGGER trg_ticket_updated_at BEFORE UPDATE ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.tickets: trg_ticket_version_bump
CREATE TRIGGER trg_ticket_version_bump BEFORE UPDATE ON tickets.tickets FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_version_bump();

-- tickets.transition_rules: trg_transition_rules_updated_at
CREATE TRIGGER trg_transition_rules_updated_at BEFORE UPDATE ON tickets.transition_rules FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.transitions: trg_transitions_updated_at
CREATE TRIGGER trg_transitions_updated_at BEFORE UPDATE ON tickets.transitions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets.workflow_versions: trg_wfv_updated_at
CREATE TRIGGER trg_wfv_updated_at BEFORE UPDATE ON tickets.workflow_versions FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- users.organizations: trg_users_orgs_updated_at
CREATE TRIGGER trg_users_orgs_updated_at BEFORE UPDATE ON users.organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- users.preferences: trg_users_prefs_updated_at
CREATE TRIGGER trg_users_prefs_updated_at BEFORE UPDATE ON users.preferences FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- users.profiles: trg_audit_users_profiles
CREATE TRIGGER trg_audit_users_profiles AFTER INSERT OR DELETE OR UPDATE ON users.profiles FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

-- users.profiles: trg_users_profiles_updated_at
CREATE TRIGGER trg_users_profiles_updated_at BEFORE UPDATE ON users.profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 9: Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tickets.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules.modules ENABLE ROW LEVEL SECURITY;

-- modules.modules: policy_modules_delete
CREATE POLICY policy_modules_delete ON modules.modules
  AS PERMISSIVE
  FOR DELETE
  TO public
  USING ((app.is_superadmin() OR (app.get_current_role() = 'admin'::text)))
;

-- modules.modules: policy_modules_insert
CREATE POLICY policy_modules_insert ON modules.modules
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK ((app.is_superadmin() OR (app.get_current_role() = 'admin'::text)))
;

-- modules.modules: policy_modules_select
CREATE POLICY policy_modules_select ON modules.modules
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (((deleted_at IS NULL) AND (app.is_superadmin() OR (app.get_current_role() = 'admin'::text) OR (EXISTS ( SELECT 1
   FROM modules.user_module_roles umr
  WHERE ((umr.module_id = modules.id) AND (umr.user_id = app.get_current_user_id()) AND (umr.is_active = true)))))))
;

-- modules.modules: policy_modules_update
CREATE POLICY policy_modules_update ON modules.modules
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((app.is_superadmin() OR (app.get_current_role() = 'admin'::text) OR app.has_module_permission('module.config'::text, id)))
  WITH CHECK (true)
;

-- tickets.tickets: policy_tickets_insert
CREATE POLICY policy_tickets_insert ON tickets.tickets
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (((created_by = app.get_current_user_id()) AND app.has_module_permission('tickets.create'::text, module_id)))
;

-- tickets.tickets: policy_tickets_select
CREATE POLICY policy_tickets_select ON tickets.tickets
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING ((app.is_superadmin() OR (app.get_current_role() = 'admin'::text) OR (created_by = app.get_current_user_id()) OR (EXISTS ( SELECT 1
   FROM tickets.ticket_assignments ta
  WHERE ((ta.ticket_id = tickets.id) AND (ta.user_id = app.get_current_user_id()) AND (ta.is_active = true)))) OR app.has_module_permission('tickets.view_all'::text, module_id)))
;

-- tickets.tickets: policy_tickets_update
CREATE POLICY policy_tickets_update ON tickets.tickets
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING ((app.is_superadmin() OR (app.get_current_role() = 'admin'::text) OR (created_by = app.get_current_user_id()) OR (EXISTS ( SELECT 1
   FROM tickets.ticket_assignments ta
  WHERE ((ta.ticket_id = tickets.id) AND (ta.user_id = app.get_current_user_id()) AND (ta.is_active = true)))) OR app.has_module_permission('tickets.transition'::text, module_id)))
  WITH CHECK (true)
;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 10: Particiones
-- ─────────────────────────────────────────────────────────────────────────────
-- Generadas via DO loops. Particiones RANGE mensuales 2026-01 a 2027-12,
-- HASH(8) para ticket_assignments.

-- HASH partitions (ticket_assignments × 8)
DO $$
BEGIN
  FOR i IN 0..7 LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS tickets.ticket_assignments_%s PARTITION OF tickets.ticket_assignments FOR VALUES WITH (MODULUS 8, REMAINDER %s)',
      i, i);
  END LOOP;
END $$;

-- RANGE partitions mensuales (2026-01 → 2027-12)
DO $$
DECLARE
  yr  INT;
  mo  INT;
  ts  TEXT;
  te  TEXT;
  suf TEXT;
BEGIN
  FOR yr IN 2026..2027 LOOP
    FOR mo IN 1..12 LOOP
      suf := to_char(make_date(yr, mo, 1), 'YYYY_MM');
      ts  := to_char(make_date(yr, mo, 1), 'YYYY-MM-DD');
      te  := to_char(make_date(yr, mo, 1) + INTERVAL '1 month', 'YYYY-MM-DD');
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS audit.event_log_%s PARTITION OF audit.event_log
         FOR VALUES FROM (''%s'') TO (''%s'')',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS notifications.notification_logs_%s PARTITION OF notifications.notification_logs
         FOR VALUES FROM (''%s'') TO (''%s'')',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS tickets.ticket_comments_%s PARTITION OF tickets.ticket_comments
         FOR VALUES FROM (''%s'') TO (''%s'')',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS tickets.ticket_state_history_%s PARTITION OF tickets.ticket_state_history
         FOR VALUES FROM (''%s'') TO (''%s'')',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS tickets.tickets_%s PARTITION OF tickets.tickets
         FOR VALUES FROM (''%s'') TO (''%s'')',
        suf, ts, te);
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 11: Views
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW modules.v_available_technicians AS
WITH tech_load AS (
         SELECT ta.user_id,
            t.module_id,
            (count(*))::integer AS active_tickets
           FROM (tickets.ticket_assignments ta
             JOIN tickets.tickets t ON ((t.id = ta.ticket_id)))
          WHERE (ta.is_active = true)
          GROUP BY ta.user_id, t.module_id
        ), last_assign AS (
         SELECT technician_assignment_log.user_id,
            technician_assignment_log.module_id,
            max(technician_assignment_log.assigned_at) AS last_assigned_at
           FROM modules.technician_assignment_log
          GROUP BY technician_assignment_log.user_id, technician_assignment_log.module_id
        )
 SELECT umr.user_id,
    umr.module_id,
    mr.name AS role_name,
    (((p.first_name)::text || ' '::text) || (p.last_name)::text) AS full_name,
    COALESCE(ts.is_available, true) AS is_available,
    ts.reason AS unavailable_reason,
    ts.unavailable_to,
    COALESCE(tl.active_tickets, 0) AS active_tickets,
    la.last_assigned_at,
    row_number() OVER (PARTITION BY umr.module_id ORDER BY COALESCE(tl.active_tickets, 0), la.last_assigned_at NULLS FIRST) AS round_robin_position
   FROM (((((modules.user_module_roles umr
     JOIN modules.module_roles mr ON ((mr.id = umr.role_id)))
     JOIN users.profiles p ON ((p.id = umr.user_id)))
     LEFT JOIN modules.technician_status ts ON (((ts.user_id = umr.user_id) AND (ts.module_id = umr.module_id))))
     LEFT JOIN tech_load tl ON (((tl.user_id = umr.user_id) AND (tl.module_id = umr.module_id))))
     LEFT JOIN last_assign la ON (((la.user_id = umr.user_id) AND (la.module_id = umr.module_id))))
  WHERE ((umr.is_active = true) AND (p.is_active = true) AND (p.deleted_at IS NULL) AND ((mr.name)::text = ANY ((ARRAY['tecnico'::character varying, 'jefe_tecnico'::character varying, 'admin_modulo'::character varying])::text[])) AND ((ts.id IS NULL) OR (ts.is_available = true) OR ((ts.is_available = false) AND (ts.unavailable_to IS NOT NULL) AND (ts.unavailable_to < now()))));;

CREATE OR REPLACE VIEW tickets.v_tickets_unified AS
SELECT t.id,
    t.module_id,
    m.name AS module_name,
    m.slug AS module_slug,
    t.environment_id,
    t.category_id,
    cat.name AS category_name,
    t.created_by,
    (((p_creator.first_name)::text || ' '::text) || (p_creator.last_name)::text) AS created_by_name,
    t.priority,
    t.urgency,
    t.impact,
    t.current_state_id,
    st.name AS current_state_name,
    st.label AS current_state_label,
    t.sla_policy_id,
    t.sla_deadline,
    t.reprocess_count,
    t.version,
    t.title,
    t.description,
    t.created_at,
    t.updated_at,
    ta_owner.user_id AS assigned_to,
    (((p_tech.first_name)::text || ' '::text) || (p_tech.last_name)::text) AS assigned_to_name,
    sla_track.status AS sla_status,
    sla_track.deadline_at AS sla_deadline_at,
    sla_track.breached_at AS sla_breached_at,
        CASE
            WHEN ((sla_track.deadline_at IS NOT NULL) AND (sla_track.breached_at IS NULL)) THEN (EXTRACT(epoch FROM (sla_track.deadline_at - now())) / 3600.0)
            ELSE NULL::numeric
        END AS sla_remaining_hours,
    appr.status AS approval_status,
    appr.expires_at AS approval_expires_at,
        CASE date(t.created_at)
            WHEN CURRENT_DATE THEN 'today'::text
            ELSE 'previous'::text
        END AS queue_group
   FROM ((((((((tickets.tickets t
     LEFT JOIN modules.modules m ON ((m.id = t.module_id)))
     LEFT JOIN modules.categories cat ON ((cat.id = t.category_id)))
     LEFT JOIN tickets.states st ON ((st.id = t.current_state_id)))
     LEFT JOIN users.profiles p_creator ON ((p_creator.id = t.created_by)))
     LEFT JOIN tickets.ticket_assignments ta_owner ON (((ta_owner.ticket_id = t.id) AND (ta_owner.role = 'owner'::assignment_role) AND (ta_owner.is_active = true))))
     LEFT JOIN users.profiles p_tech ON ((p_tech.id = ta_owner.user_id)))
     LEFT JOIN tickets.ticket_sla_tracking sla_track ON ((sla_track.ticket_id = t.id)))
     LEFT JOIN tickets.ticket_approvals appr ON (((appr.ticket_id = t.id) AND (appr.status = 'pending'::approval_status))));;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 12: Materialized Views
-- ─────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS reports.technician_load AS
SELECT ta.user_id,
    t.module_id,
    (((p.first_name)::text || ' '::text) || (p.last_name)::text) AS full_name,
    count(*) AS active_tickets,
    count(*) FILTER (WHERE (t.priority = 'critica'::priority_level)) AS critical_count,
    count(*) FILTER (WHERE (t.priority = 'alta'::priority_level)) AS high_count,
    now() AS refreshed_at
   FROM (((tickets.ticket_assignments ta
     JOIN tickets.tickets t ON ((t.id = ta.ticket_id)))
     JOIN users.profiles p ON ((p.id = ta.user_id)))
     JOIN tickets.states st ON (((st.id = t.current_state_id) AND (st.is_final = false))))
  WHERE ((ta.is_active = true) AND (ta.role = 'owner'::assignment_role))
  GROUP BY ta.user_id, t.module_id, p.first_name, p.last_name;;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 13: Seeds base (organización, roles globales, feature flags)
-- ─────────────────────────────────────────────────────────────────────────────

-- Organización single-tenant
INSERT INTO users.organizations (id, name, slug) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Mi Empresa', 'default')
ON CONFLICT DO NOTHING;

-- Roles globales (solo superadmin y usuario en v7.0)
INSERT INTO config.global_roles (id, name, description) VALUES
    ('00000000-0000-0000-0001-000000000001', 'superadmin', 'Administrador global de la plataforma'),
    ('00000000-0000-0000-0001-000000000002', 'usuario',    'Usuario estándar del sistema')
ON CONFLICT (name) DO NOTHING;

-- Perfil sistema (actor para operaciones automáticas)
INSERT INTO users.profiles (id, first_name, last_name, is_superadmin, is_active, profile_complete, global_role_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Admin', 'Sistema', true, true, true,
    '00000000-0000-0000-0001-000000000001')
ON CONFLICT DO NOTHING;

-- Feature flags base
INSERT INTO config.feature_flags (module_id, flag_key, is_enabled, description) VALUES
    (NULL, 'google_oauth_enabled',    false, 'Habilita login con Google OAuth'),
    (NULL, 'video_calls_enabled',     false, 'Habilita videollamadas en tickets'),
    (NULL, 'ticket_ratings_enabled',  true,  'Habilita calificación de servicio al cerrar ticket')
ON CONFLICT DO NOTHING;

-- Module settings globales
INSERT INTO config.module_settings (module_id, key, value, value_type, description, is_active) VALUES
    (NULL, 'company_info',         '{"name":"Mi Empresa","language":"es","timezone":"America/Bogota","support_email":"soporte@miempresa.com"}', 'json',   'Información de la empresa', true),
    (NULL, 'auth_config',          '{"allow_local_auth":true,"session_duration_hours":8,"require_email_verification":false}', 'json', 'Configuración de autenticación', true),
    (NULL, 'notification_defaults','{"channels":["in_app","email"],"email_from":"noreply@miempresa.com","whatsapp_enabled":false}', 'json', 'Configuración de notificaciones', true),
    (NULL, 'rating_ttl_days',      '7',     'string', 'Días disponibles para calificar ticket cerrado', true),
    (NULL, 'trash_warning_days',   '7,3,1', 'string', 'Días antes del hard-delete para aviso (CSV)', true)
ON CONFLICT (module_id, key, version) DO NOTHING;

-- Bootstrap módulos base (helpdesk + inventario)
SELECT modules.bootstrap_module(
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Helpdesk', 'helpdesk', 'Sistema principal de tickets y soporte técnico', true, '00000000-0000-0000-0000-000000000001'::UUID
);

SELECT modules.bootstrap_module(
    '00000000-0000-0000-0000-000000000001'::UUID,
    'Inventario', 'inventario', 'Gestión de activos e inventario corporativo', true, '00000000-0000-0000-0000-000000000001'::UUID
);

-- ============================================================================
-- FIN — DB_FINAL_v7_0.sql
-- Para datos demo: node seed_empresa.js && node seed_missing.js
-- ============================================================================