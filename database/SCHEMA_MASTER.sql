-- ============================================================================
-- SCHEMA_MASTER.sql — Schema maestro consolidado
-- Sistema Modular de Gestión de Tickets
-- Versión: 8.0 (fusión v7.0 + migraciones v8–v12)
-- Fecha: 2026-05-19
--
-- Aplicar en DB vacía:
--   psql -d <db> -v ON_ERROR_STOP=1 -f SCHEMA_MASTER.sql
--
-- Módulos built-in: Helpdesk · Inventario · Gestión Administrativa
-- Datos de prueba: ver database/SEED_TEST.sql
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
CREATE SCHEMA IF NOT EXISTS org;
CREATE SCHEMA IF NOT EXISTS reports;
CREATE SCHEMA IF NOT EXISTS requests;
CREATE SCHEMA IF NOT EXISTS tickets;
CREATE SCHEMA IF NOT EXISTS users;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 2: ENUMs
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
    CREATE TYPE action_type AS ENUM ('notify', 'assign', 'close', 'escalate', 'auto_approve');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE actor_type AS ENUM ('user', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE asset_status AS ENUM ('disponible', 'asignado', 'en_reparacion', 'dado_de_baja');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE assignment_method AS ENUM ('round_robin', 'least_load');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE assignment_role AS ENUM ('owner', 'collaborator', 'observer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE impact_level AS ENUM ('bajo', 'medio', 'alto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE notification_channel AS ENUM ('in_app', 'email', 'whatsapp', 'sms');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE outbox_status AS ENUM ('pending', 'processing', 'done', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE priority_level AS ENUM ('baja', 'media', 'alta', 'critica');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE technician_type AS ENUM ('specialist', 'generalist', 'both');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE urgency_level AS ENUM ('baja', 'media', 'alta', 'critica');
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

CREATE OR REPLACE FUNCTION app.get_current_module_id()
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_module_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION app.get_current_organization_id()
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $$
BEGIN
    RETURN '00000000-0000-0000-0000-000000000001'::UUID;
END; $$;

CREATE OR REPLACE FUNCTION app.get_current_role()
 RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $$
DECLARE v_role TEXT;
BEGIN
    BEGIN v_role := current_setting('app.current_role', true);
    EXCEPTION WHEN OTHERS THEN v_role := NULL; END;
    RETURN v_role;
END; $$;

CREATE OR REPLACE FUNCTION app.get_current_user_id()
 RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app'
AS $$
DECLARE v_id UUID;
BEGIN
    BEGIN v_id := current_setting('app.current_user_id', true)::UUID;
    EXCEPTION WHEN OTHERS THEN v_id := NULL; END;
    RETURN v_id;
END; $$;

-- Usa el nuevo sistema RBAC (config.role_permission_grants).
-- Las RLS policies llaman esta función; el backend aplica permisos vía guards.
CREATE OR REPLACE FUNCTION app.has_module_permission(p_permission text, p_module_id uuid DEFAULT NULL::uuid)
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'modules', 'config'
AS $$
DECLARE
    v_module_id UUID;
    v_has       BOOLEAN := false;
BEGIN
    v_module_id := COALESCE(p_module_id, app.get_current_module_id());
    IF v_module_id IS NULL THEN RETURN false; END IF;

    SELECT EXISTS (
        SELECT 1
        FROM   modules.user_module_roles  umr
        JOIN   config.role_permission_grants rpg
               ON  rpg.role_id    = umr.role_id
               AND rpg.role_type  = 'module'
        WHERE  umr.user_id    = app.get_current_user_id()
        AND    umr.module_id  = v_module_id
        AND    rpg.permission_key = p_permission
        AND    umr.is_active  = true
    ) INTO v_has;

    RETURN v_has;
END; $$;

CREATE OR REPLACE FUNCTION app.is_superadmin()
 RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'users'
AS $$
DECLARE v_uid UUID;
BEGIN
    v_uid := app.get_current_user_id();
    IF v_uid IS NULL THEN RETURN false; END IF;
    RETURN EXISTS (
        SELECT 1 FROM users.profiles
        WHERE id = v_uid AND is_superadmin = true AND deleted_at IS NULL
    );
END; $$;

CREATE OR REPLACE FUNCTION app.validate_user_exists()
 RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'app', 'users'
AS $$
DECLARE
    v_field_name TEXT := COALESCE(TG_ARGV[0], 'user_id');
    v_user_id    UUID;
    v_exists     BOOLEAN;
BEGIN
    EXECUTE FORMAT('SELECT ($1).%I::UUID', v_field_name) USING NEW INTO v_user_id;
    IF v_user_id IS NULL THEN RETURN NEW; END IF;

    SELECT EXISTS (
        SELECT 1 FROM users.profiles WHERE id = v_user_id AND deleted_at IS NULL
    ) INTO v_exists;

    IF NOT v_exists THEN
        RAISE EXCEPTION '[BUG-1] user_id % no existe en users.profiles o está eliminado (tabla: %.%, columna: %)',
            v_user_id, TG_TABLE_SCHEMA, TG_TABLE_NAME, v_field_name
            USING ERRCODE = 'foreign_key_violation';
    END IF;
    RETURN NEW;
END; $$;

-- Bootstrap completo de un módulo: crea roles estándar, FSM, política de asignación
CREATE OR REPLACE FUNCTION modules.bootstrap_module(
    p_organization_id uuid,
    p_name            text,
    p_slug            text,
    p_description     text    DEFAULT NULL,
    p_is_default      boolean DEFAULT false,
    p_created_by      uuid    DEFAULT NULL,
    p_type            text    DEFAULT 'helpdesk',
    p_permission_scope text   DEFAULT NULL,
    p_is_builtin      boolean DEFAULT false
)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'modules', 'tickets', 'config', 'app'
AS $$
DECLARE
    v_module_id    UUID;
    v_role_user    UUID;
    v_role_tech    UUID;
    v_role_chief   UUID;
    v_role_admin   UUID;
    v_wfv_id       UUID;
    v_st_open      UUID;
    v_st_process   UUID;
    v_st_wait      UUID;
    v_st_done      UUID;
    v_st_closed    UUID;
    v_st_reprocess UUID;
    v_scope        TEXT;
BEGIN
    v_scope := COALESCE(p_permission_scope, p_slug);

    INSERT INTO modules.modules (name, slug, description, type, is_active, permission_scope, is_builtin)
    VALUES (p_name, p_slug, p_description, p_type, true, v_scope, p_is_builtin)
    ON CONFLICT (slug) DO UPDATE SET
        name             = EXCLUDED.name,
        description      = COALESCE(EXCLUDED.description, modules.modules.description),
        is_active        = EXCLUDED.is_active,
        permission_scope = COALESCE(EXCLUDED.permission_scope, modules.modules.permission_scope),
        is_builtin       = modules.modules.is_builtin OR EXCLUDED.is_builtin,
        updated_at       = now()
    RETURNING id INTO v_module_id;

    INSERT INTO modules.module_roles (module_id, name, description, is_active, is_admin)
    VALUES (v_module_id, 'usuario', 'Crea y sigue sus tickets', true, false)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_role_user;

    INSERT INTO modules.module_roles (module_id, name, description, is_active, is_admin)
    VALUES (v_module_id, 'tecnico', 'Atiende tickets del módulo', true, false)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_role_tech;

    INSERT INTO modules.module_roles (module_id, name, description, is_active, is_admin)
    VALUES (v_module_id, 'jefe_tecnico', 'Atiende tickets críticos/reproceso', true, false)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active, updated_at = now()
    RETURNING id INTO v_role_chief;

    INSERT INTO modules.module_roles (module_id, name, description, is_active, is_admin)
    VALUES (v_module_id, 'admin_modulo', 'Configuración del módulo', true, true)
    ON CONFLICT (module_id, name) DO UPDATE SET
        description = EXCLUDED.description, is_active = EXCLUDED.is_active,
        is_admin = true, updated_at = now()
    RETURNING id INTO v_role_admin;

    IF NOT EXISTS (SELECT 1 FROM tickets.workflow_versions WHERE module_id = v_module_id AND version = 1) THEN
        INSERT INTO tickets.workflow_versions (module_id, version, description, is_active)
        VALUES (v_module_id, 1, 'Workflow estándar v1', true)
        RETURNING id INTO v_wfv_id;

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

        INSERT INTO tickets.transitions (workflow_version_id, module_id, from_state_id, to_state_id, name) VALUES
        (v_wfv_id, v_module_id, v_st_open,      v_st_process,   'Tomar ticket'),
        (v_wfv_id, v_module_id, v_st_process,   v_st_wait,      'Solicitar información'),
        (v_wfv_id, v_module_id, v_st_process,   v_st_done,      'Marcar realizado'),
        (v_wfv_id, v_module_id, v_st_wait,      v_st_process,   'Reanudar'),
        (v_wfv_id, v_module_id, v_st_done,      v_st_closed,    'Aprobar y cerrar'),
        (v_wfv_id, v_module_id, v_st_done,      v_st_reprocess, 'Rechazar solución'),
        (v_wfv_id, v_module_id, v_st_reprocess, v_st_process,   'Retomar para reproceso');
    ELSE
        SELECT id INTO v_wfv_id FROM tickets.workflow_versions
        WHERE module_id = v_module_id AND version = 1;
    END IF;

    INSERT INTO tickets.assignment_policies
        (module_id, use_specialists, use_generalists, specialist_overflow_enabled,
         specialist_overflow_threshold, assignment_method)
    VALUES (v_module_id, true, true, true, 5, 'round_robin')
    ON CONFLICT (module_id) DO NOTHING;

    INSERT INTO config.module_settings (module_id, key, value, value_type, is_active, description)
    VALUES
    (v_module_id, 'ticket_flow',
        '{"reproceso_max":1,"auto_close_hours":48,"digital_signature_required":true,"allow_user_create":true}',
        'json', true, 'Configuración del flujo de tickets'),
    (v_module_id, 'queue_config',
        '{"max_tickets_per_technician":10,"priority_order":["critica","alta","media","baja"],"day_split":true}',
        'json', true, 'Configuración de cola de asignación')
    ON CONFLICT (module_id, key, version) DO NOTHING;

    RETURN jsonb_build_object(
        'ok', true, 'module_id', v_module_id, 'module_slug', p_slug,
        'workflow_version_id', v_wfv_id,
        'roles', jsonb_build_object(
            'usuario', v_role_user, 'tecnico', v_role_tech,
            'jefe_tecnico', v_role_chief, 'admin_modulo', v_role_admin
        ),
        'message', 'Módulo ' || p_name || ' creado exitosamente.'
    );
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '[bootstrap_module] Fallo al crear módulo "%": % — SQLSTATE: %', p_name, SQLERRM, SQLSTATE;
END; $$;

CREATE OR REPLACE FUNCTION tickets.assign_ticket_hybrid(p_ticket_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'modules', 'events', 'app'
AS $$
DECLARE
    v_ticket        RECORD;
    v_policy        RECORD;
    v_selected_tech UUID;
    v_pool          TEXT;
    v_last_user_id  UUID;
    v_lock_key      TEXT;
    v_assignment_id UUID;
BEGIN
    SELECT t.id, t.module_id, t.environment_id, t.category_id INTO v_ticket
    FROM tickets.tickets t WHERE t.id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found'); END IF;

    IF EXISTS (SELECT 1 FROM tickets.ticket_assignments
               WHERE ticket_id = p_ticket_id AND role = 'owner' AND is_active = true) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'already_assigned',
            'detail', 'Ticket already has an active owner from a prior successful call');
    END IF;

    SELECT * INTO v_policy FROM tickets.assignment_policies WHERE module_id = v_ticket.module_id;
    IF NOT FOUND THEN
        v_policy.use_specialists             := false;
        v_policy.use_generalists             := true;
        v_policy.specialist_overflow_enabled := false;
        v_policy.specialist_overflow_threshold := 5;
        v_policy.assignment_method           := 'round_robin';
    END IF;

    IF v_policy.use_specialists THEN
        v_lock_key := v_ticket.module_id::TEXT || ':' || v_ticket.environment_id::TEXT || ':' ||
                      COALESCE(v_ticket.category_id::TEXT, 'GEN') || ':specialist';
        PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

        SELECT tac.last_assigned_user_id INTO v_last_user_id
        FROM tickets.ticket_assignment_counters tac
        WHERE tac.module_id = v_ticket.module_id AND tac.environment_id = v_ticket.environment_id
          AND tac.category_id = v_ticket.category_id AND tac.technician_type = 'specialist';

        SELECT tp.user_id INTO v_selected_tech
        FROM tickets.technician_profiles tp
        JOIN tickets.technician_category_skills tcs ON tcs.user_id = tp.user_id
            AND tcs.module_id = tp.module_id AND tcs.category_id = v_ticket.category_id AND tcs.is_active = true
        JOIN modules.user_module_roles umr ON umr.user_id = tp.user_id AND umr.module_id = tp.module_id AND umr.is_active = true
        JOIN modules.module_roles mr ON mr.id = umr.role_id AND mr.name = 'tecnico'
        WHERE tp.module_id = v_ticket.module_id AND tp.technician_type IN ('specialist','both') AND tp.is_active = true
          AND NOT EXISTS (SELECT 1 FROM tickets.technician_leaves tl WHERE tl.user_id = tp.user_id
                          AND CURRENT_DATE BETWEEN tl.start_date AND tl.end_date)
          AND NOT EXISTS (SELECT 1 FROM modules.technician_status ts WHERE ts.user_id = tp.user_id
                          AND ts.module_id = tp.module_id AND ts.is_available = false
                          AND (ts.unavailable_to IS NULL OR ts.unavailable_to > now()))
          AND (NOT v_policy.specialist_overflow_enabled OR
               (SELECT COUNT(*) FROM tickets.ticket_assignments ta
                WHERE ta.user_id = tp.user_id AND DATE(ta.assigned_at) = CURRENT_DATE AND ta.is_active = true)
               < COALESCE(tp.max_daily_tickets, v_policy.specialist_overflow_threshold))
        ORDER BY
            CASE WHEN v_policy.assignment_method = 'least_load' THEN
                (SELECT COUNT(*) FROM tickets.ticket_assignments ta2 WHERE ta2.user_id = tp.user_id AND ta2.is_active = true)
            ELSE 0 END ASC,
            CASE WHEN v_last_user_id IS NULL THEN 0 WHEN tp.user_id > v_last_user_id THEN 0 ELSE 1 END ASC,
            tp.user_id ASC
        LIMIT 1;

        IF v_selected_tech IS NOT NULL THEN v_pool := 'specialist'; END IF;
    END IF;

    IF v_selected_tech IS NULL AND v_policy.use_generalists THEN
        v_lock_key := v_ticket.module_id::TEXT || ':' || v_ticket.environment_id::TEXT || ':GEN:generalist';
        PERFORM pg_advisory_xact_lock(hashtextextended(v_lock_key, 0));

        SELECT tac.last_assigned_user_id INTO v_last_user_id
        FROM tickets.ticket_assignment_counters tac
        WHERE tac.module_id = v_ticket.module_id AND tac.environment_id = v_ticket.environment_id
          AND tac.category_id IS NULL AND tac.technician_type = 'generalist';

        SELECT tp.user_id INTO v_selected_tech
        FROM tickets.technician_profiles tp
        JOIN modules.user_module_roles umr ON umr.user_id = tp.user_id AND umr.module_id = tp.module_id AND umr.is_active = true
        JOIN modules.module_roles mr ON mr.id = umr.role_id AND mr.name IN ('tecnico','jefe_tecnico')
        WHERE tp.module_id = v_ticket.module_id AND tp.technician_type IN ('generalist','both') AND tp.is_active = true
          AND NOT EXISTS (SELECT 1 FROM tickets.technician_leaves tl WHERE tl.user_id = tp.user_id
                          AND CURRENT_DATE BETWEEN tl.start_date AND tl.end_date)
          AND NOT EXISTS (SELECT 1 FROM modules.technician_status ts WHERE ts.user_id = tp.user_id
                          AND ts.module_id = tp.module_id AND ts.is_available = false
                          AND (ts.unavailable_to IS NULL OR ts.unavailable_to > now()))
        ORDER BY
            CASE WHEN v_policy.assignment_method = 'least_load' THEN
                (SELECT COUNT(*) FROM tickets.ticket_assignments ta2 WHERE ta2.user_id = tp.user_id AND ta2.is_active = true)
            ELSE 0 END ASC,
            CASE WHEN v_last_user_id IS NULL THEN 0 WHEN tp.user_id > v_last_user_id THEN 0 ELSE 1 END ASC,
            tp.user_id ASC
        LIMIT 1;

        IF v_selected_tech IS NOT NULL THEN v_pool := 'generalist'; END IF;
    END IF;

    IF v_selected_tech IS NULL THEN
        INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
        VALUES ('ticket', p_ticket_id, 'ticket.assignment_failed',
                jsonb_build_object('ticket_id', p_ticket_id, 'module_id', v_ticket.module_id));
        RETURN jsonb_build_object('ok', false, 'error', 'no_technician_available');
    END IF;

    INSERT INTO tickets.ticket_assignments (ticket_id, user_id, role, assigned_by, assigned_at, is_active)
    VALUES (p_ticket_id, v_selected_tech, 'owner',
            COALESCE(app.get_current_user_id(), '00000000-0000-0000-0000-000000000001'::UUID), now(), true)
    ON CONFLICT (ticket_id) WHERE role = 'owner' AND is_active = true DO NOTHING
    RETURNING id INTO v_assignment_id;

    IF v_assignment_id IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'concurrent_assignment_race',
            'detail', 'A concurrent transaction assigned an owner first; safe to retry');
    END IF;

    INSERT INTO tickets.ticket_assignment_counters AS tac
        (module_id, environment_id, category_id, technician_type, last_assigned_user_id, assignment_count, updated_at)
    VALUES (
        v_ticket.module_id, v_ticket.environment_id,
        CASE WHEN v_pool = 'specialist' THEN v_ticket.category_id ELSE NULL END,
        CASE WHEN v_pool = 'specialist' THEN 'specialist'::technician_type ELSE 'generalist'::technician_type END,
        v_selected_tech, 1, now()
    )
    ON CONFLICT (module_id, environment_id, category_id, technician_type)
    DO UPDATE SET last_assigned_user_id = EXCLUDED.last_assigned_user_id,
                  assignment_count = tac.assignment_count + 1, updated_at = now();

    INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('ticket', p_ticket_id, 'ticket.assigned', jsonb_build_object(
        'ticket_id', p_ticket_id, 'assigned_to', v_selected_tech,
        'module_id', v_ticket.module_id, 'environment_id', v_ticket.environment_id, 'pool_used', v_pool));

    RETURN jsonb_build_object('ok', true, 'ticket_id', p_ticket_id,
        'assigned_to', v_selected_tech, 'pool_used', v_pool);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END; $$;

CREATE OR REPLACE FUNCTION tickets.evaluate_sla_condition(p_condition jsonb, p_context jsonb)
 RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT
 SET search_path TO 'pg_catalog', 'public'
AS $$
DECLARE
    v_field      TEXT    := p_condition->>'field';
    v_operator   TEXT    := p_condition->>'operator';
    v_value      TEXT    := p_condition->>'value';
    v_actual     TEXT;
    v_actual_num NUMERIC;
    v_value_num  NUMERIC;
BEGIN
    v_actual := p_context->>v_field;
    IF v_actual IS NULL THEN RETURN false; END IF;

    IF v_operator = '='  THEN RETURN v_actual = v_value; END IF;
    IF v_operator = '!=' THEN RETURN v_actual != v_value; END IF;
    IF v_operator = 'IN' THEN
        IF p_condition ? 'values' THEN
            RETURN v_actual = ANY(ARRAY(SELECT jsonb_array_elements_text(p_condition->'values')));
        ELSE
            RETURN v_actual = ANY(string_to_array(v_value, ','));
        END IF;
    END IF;

    BEGIN
        v_actual_num := v_actual::NUMERIC;
        v_value_num  := v_value::NUMERIC;
    EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;

    RETURN CASE v_operator
        WHEN '>'  THEN v_actual_num >  v_value_num
        WHEN '<'  THEN v_actual_num <  v_value_num
        WHEN '>=' THEN v_actual_num >= v_value_num
        WHEN '<=' THEN v_actual_num <= v_value_num
        ELSE false
    END;
END; $$;

CREATE OR REPLACE FUNCTION tickets.execute_transition(p_ticket_id uuid, p_transition_id uuid, p_comment text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'events', 'app'
AS $$
DECLARE
    v_ticket     RECORD;
    v_transition RECORD;
BEGIN
    SELECT t.id, t.current_state_id, t.module_id INTO v_ticket
    FROM tickets.tickets t WHERE t.id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'ticket_not_found'); END IF;

    SELECT tr.id, tr.to_state_id, tr.name INTO v_transition
    FROM tickets.transitions tr
    WHERE tr.id = p_transition_id AND tr.from_state_id = v_ticket.current_state_id AND tr.is_active = true;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid_transition'); END IF;

    UPDATE tickets.tickets SET current_state_id = v_transition.to_state_id WHERE id = p_ticket_id;

    IF p_comment IS NOT NULL AND p_comment != '' THEN
        INSERT INTO tickets.ticket_comments (ticket_id, user_id, comment_type, content, created_at)
        VALUES (p_ticket_id,
                COALESCE(app.get_current_user_id(), '00000000-0000-0000-0000-000000000001'::UUID),
                'internal', p_comment, now());
    END IF;

    INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('ticket', p_ticket_id, 'ticket.state_changed', jsonb_build_object(
        'ticket_id', p_ticket_id, 'from_state_id', v_ticket.current_state_id,
        'to_state_id', v_transition.to_state_id, 'transition_id', p_transition_id, 'comment', p_comment));

    RETURN jsonb_build_object('ok', true, 'ticket_id', p_ticket_id, 'new_state_id', v_transition.to_state_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END; $$;

CREATE OR REPLACE FUNCTION tickets.fn_ticket_state_audit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'audit', 'app'
AS $$
BEGIN
    IF NEW.current_state_id IS DISTINCT FROM OLD.current_state_id THEN
        INSERT INTO audit.event_log (actor_id, actor_type, action, entity_type, entity_id, old_value, new_value, created_at)
        VALUES (app.get_current_user_id(), 'user'::actor_type, 'ticket.state_changed', 'ticket', NEW.id,
                jsonb_build_object('state_id', OLD.current_state_id),
                jsonb_build_object('state_id', NEW.current_state_id), now());
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION tickets.fn_ticket_state_history()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'app'
AS $$
BEGIN
    IF NEW.current_state_id IS DISTINCT FROM OLD.current_state_id THEN
        INSERT INTO tickets.ticket_state_history (ticket_id, from_state_id, to_state_id, transitioned_by, transitioned_at)
        VALUES (NEW.id, OLD.current_state_id, NEW.current_state_id,
                COALESCE(app.get_current_user_id(), '00000000-0000-0000-0000-000000000001'::UUID), now());
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION tickets.fn_ticket_version_bump()
 RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN NEW.version := OLD.version + 1; RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION tickets.fn_validate_ticket_coherence()
 RETURNS trigger LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets'
AS $$
DECLARE
    v_state_module UUID;
    v_state_wfv    UUID;
    v_wfv_module   UUID;
BEGIN
    SELECT s.module_id, s.workflow_version_id INTO v_state_module, v_state_wfv
    FROM tickets.states s WHERE s.id = NEW.current_state_id;
    SELECT wv.module_id INTO v_wfv_module
    FROM tickets.workflow_versions wv WHERE wv.id = NEW.workflow_version_id;

    IF v_state_module IS DISTINCT FROM NEW.module_id THEN
        RAISE EXCEPTION 'Incoherencia: state.module_id (%) != ticket.module_id (%)', v_state_module, NEW.module_id;
    END IF;
    IF v_state_wfv IS DISTINCT FROM NEW.workflow_version_id THEN
        RAISE EXCEPTION 'Incoherencia: state.workflow_version_id (%) != ticket.workflow_version_id (%)', v_state_wfv, NEW.workflow_version_id;
    END IF;
    IF v_wfv_module IS DISTINCT FROM NEW.module_id THEN
        RAISE EXCEPTION 'Incoherencia: workflow_version.module_id (%) != ticket.module_id (%)', v_wfv_module, NEW.module_id;
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION tickets.generate_approval_token(p_ticket_id uuid, p_user_id uuid, p_hours integer DEFAULT 48)
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'events'
AS $$
DECLARE
    v_approval_id UUID;
BEGIN
    INSERT INTO tickets.ticket_approvals (ticket_id, user_id, token, status, expires_at)
    VALUES (p_ticket_id, p_user_id, encode(gen_random_bytes(32), 'hex'), 'pending', now() + (p_hours || ' hours')::INTERVAL)
    RETURNING id INTO v_approval_id;

    INSERT INTO events.outbox (aggregate_type, aggregate_id, event_type, payload)
    VALUES ('ticket', p_ticket_id, 'ticket.approval_requested', jsonb_build_object(
        'ticket_id', p_ticket_id, 'user_id', p_user_id, 'approval_id', v_approval_id,
        'expires_at', now() + (p_hours || ' hours')::INTERVAL));

    RETURN v_approval_id;
END; $$;

CREATE OR REPLACE FUNCTION tickets.resolve_sla(
    p_module_id      uuid,
    p_category_id    uuid    DEFAULT NULL,
    p_environment_id uuid    DEFAULT NULL,
    p_urgency        urgency_level DEFAULT NULL,
    p_impact         impact_level  DEFAULT NULL
)
 RETURNS TABLE(policy_id uuid, rule_id uuid, priority_result priority_level, resolution_time_hours integer)
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets'
AS $$
DECLARE v_context JSONB;
BEGIN
    v_context := jsonb_strip_nulls(jsonb_build_object(
        'category_id', p_category_id::TEXT, 'environment_id', p_environment_id::TEXT,
        'urgency', p_urgency::TEXT, 'impact', p_impact::TEXT));

    RETURN QUERY
    WITH active_policy AS (
        SELECT sp.id FROM tickets.sla_policies sp
        WHERE sp.module_id = p_module_id AND sp.is_active = true AND sp.deprecated_at IS NULL
        ORDER BY sp.version DESC LIMIT 1
    ),
    candidate_rules AS (
        SELECT sr.id AS rule_id, sr.policy_id, sr.priority_result, sr.resolution_time_hours, sr.rule_order
        FROM tickets.sla_rules sr JOIN active_policy ap ON ap.id = sr.policy_id
        WHERE (sr.valid_from IS NULL OR sr.valid_from <= now())
          AND (sr.valid_until IS NULL OR sr.valid_until > now())
    ),
    rule_groups AS (
        SELECT sc.rule_id, sc.logical_group,
               bool_and(tickets.evaluate_sla_condition(
                   jsonb_build_object('field', sc.field, 'operator', sc.operator, 'value', sc.value),
                   v_context)) AS group_passes
        FROM tickets.sla_conditions sc JOIN candidate_rules cr ON cr.rule_id = sc.rule_id
        GROUP BY sc.rule_id, sc.logical_group
    ),
    rule_match AS (
        SELECT rule_id, bool_or(group_passes) AS matches FROM rule_groups GROUP BY rule_id
    )
    SELECT cr.policy_id, cr.rule_id, cr.priority_result, cr.resolution_time_hours
    FROM candidate_rules cr LEFT JOIN rule_match rm ON rm.rule_id = cr.rule_id
    WHERE COALESCE(rm.matches, true) = true
    ORDER BY cr.rule_order ASC LIMIT 1;
END; $$;

CREATE OR REPLACE FUNCTION reports.refresh_all()
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'reports'
AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY reports.technician_load;
    RETURN 'Vistas materializadas actualizadas: ' || now()::TEXT;
END; $$;

CREATE OR REPLACE FUNCTION audit.log_entity_changes()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'audit', 'app'
AS $$
BEGIN
    INSERT INTO audit.event_log (actor_id, actor_type, action, entity_type, entity_id, old_value, new_value, created_at)
    VALUES (
        app.get_current_user_id(), 'user'::actor_type, TG_OP,
        TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        CASE TG_OP WHEN 'DELETE' THEN (OLD).id ELSE (NEW).id END,
        CASE TG_OP WHEN 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
        CASE TG_OP WHEN 'DELETE' THEN NULL ELSE to_jsonb(NEW) END,
        now()
    );
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END; $$;

CREATE OR REPLACE FUNCTION inventory.fn_asset_version_bump()
 RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN NEW.version := OLD.version + 1; RETURN NEW; END; $$;

CREATE OR REPLACE FUNCTION inventory.fn_assets_generate_qr()
 RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.qr_code IS NULL OR NEW.qr_code = '' THEN
        NEW.qr_code := 'QR-' || gen_random_uuid()::TEXT;
    END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION maintenance.create_future_partitions(p_months_ahead integer DEFAULT 6)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'tickets', 'audit', 'notifications', 'maintenance'
AS $$
DECLARE
    v_start  DATE := DATE_TRUNC('month', CURRENT_DATE + INTERVAL '1 month');
    v_end    DATE := DATE_TRUNC('month', CURRENT_DATE + (p_months_ahead || ' months')::INTERVAL);
    v_cur    DATE := v_start;
    v_next   DATE;
    v_suffix TEXT;
    v_iters  INT  := 0;
BEGIN
    WHILE v_cur < v_end LOOP
        v_next   := v_cur + INTERVAL '1 month';
        v_suffix := TO_CHAR(v_cur, 'YYYY_MM');
        EXECUTE FORMAT('CREATE TABLE IF NOT EXISTS tickets.tickets_%s PARTITION OF tickets.tickets FOR VALUES FROM (%L) TO (%L)', v_suffix, v_cur, v_next);
        EXECUTE FORMAT('CREATE TABLE IF NOT EXISTS tickets.ticket_state_history_%s PARTITION OF tickets.ticket_state_history FOR VALUES FROM (%L) TO (%L)', v_suffix, v_cur, v_next);
        EXECUTE FORMAT('CREATE TABLE IF NOT EXISTS audit.event_log_%s PARTITION OF audit.event_log FOR VALUES FROM (%L) TO (%L)', v_suffix, v_cur, v_next);
        EXECUTE FORMAT('CREATE TABLE IF NOT EXISTS notifications.notification_logs_%s PARTITION OF notifications.notification_logs FOR VALUES FROM (%L) TO (%L)', v_suffix, v_cur, v_next);
        EXECUTE FORMAT('CREATE TABLE IF NOT EXISTS tickets.ticket_comments_%s PARTITION OF tickets.ticket_comments FOR VALUES FROM (%L) TO (%L)', v_suffix, v_cur, v_next);
        v_iters := v_iters + 1;
        v_cur   := v_next;
    END LOOP;
    RETURN FORMAT('Particiones creadas/verificadas: %s meses.', v_iters);
END; $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 5: Tablas
-- ─────────────────────────────────────────────────────────────────────────────

-- ── users ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users.organizations (
    id              uuid         NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
    name            varchar(200) NOT NULL DEFAULT 'Mi Empresa',
    slug            varchar(100) NOT NULL DEFAULT 'mi-empresa',
    timezone        varchar(100) NOT NULL DEFAULT 'America/Bogota',
    language        varchar(10)  NOT NULL DEFAULT 'es',
    is_active       boolean      NOT NULL DEFAULT true,
    is_initialized  boolean      NOT NULL DEFAULT false,
    metadata        jsonb        NOT NULL DEFAULT '{}',
    logo_url        text,
    primary_color   varchar(20)  DEFAULT '#6366f1',
    website         varchar(255),
    contact_email   varchar(255),
    contact_phone   varchar(30),
    fiscal_id       varchar(50),
    industry        varchar(100),
    employee_count  integer,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_organizations PRIMARY KEY (id),
    CONSTRAINT organizations_slug_key UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS users.profiles (
    id                      uuid         NOT NULL DEFAULT gen_random_uuid(),
    first_name              varchar(100) NOT NULL,
    last_name               varchar(100) NOT NULL,
    display_email           varchar(255),
    phone                   varchar(30),
    phone_prefix            varchar(10),
    avatar_url              text,
    username                varchar(100),
    is_superadmin           boolean      NOT NULL DEFAULT false,
    is_active               boolean      NOT NULL DEFAULT true,
    global_role_id          uuid,
    profile_complete        boolean      NOT NULL DEFAULT false,
    address                 text,
    job_title               varchar(150),
    department              varchar(150),
    primary_sede            varchar(200),
    country                 varchar(100),
    state_province          varchar(150),
    city                    varchar(150),
    birth_date              date,
    national_id             varchar(50),
    gender                  varchar(30),
    emergency_contact_name  varchar(100),
    emergency_contact_phone varchar(50),
    last_seen_at            timestamptz,
    scheduled_hard_delete_at timestamptz,
    deleted_at              timestamptz,
    created_at              timestamptz  NOT NULL DEFAULT now(),
    updated_at              timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_profiles PRIMARY KEY (id),
    CONSTRAINT chk_profiles_gender CHECK (gender IN ('masculino','femenino','no_binario','prefiero_no_decir','otro'))
);

CREATE TABLE IF NOT EXISTS users.preferences (
    id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id              uuid        NOT NULL,
    language             varchar(10) NOT NULL DEFAULT 'es',
    timezone             varchar(50) NOT NULL DEFAULT 'America/Bogota',
    notification_email   boolean     NOT NULL DEFAULT true,
    notification_whatsapp boolean    NOT NULL DEFAULT false,
    notification_in_app  boolean     NOT NULL DEFAULT true,
    ui_settings          jsonb,
    deleted_at           timestamptz,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_preferences PRIMARY KEY (id),
    CONSTRAINT preferences_user_id_key UNIQUE (user_id)
);

-- ── org ──────────────────────────────────────────────────────────────────────
-- Note: org.headquarters, org.departments, org.areas, org.positions were
-- dropped in migration 013 (replaced by the dynamic org.nodes tree).

CREATE TABLE IF NOT EXISTS org.departments (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    name        varchar(150) NOT NULL,
    description text,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_departments PRIMARY KEY (id),
    CONSTRAINT uq_departments_name UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS org.areas (
    id            uuid         NOT NULL DEFAULT gen_random_uuid(),
    department_id uuid,
    name          varchar(150) NOT NULL,
    description   text,
    is_active     boolean      NOT NULL DEFAULT true,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_areas PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS org.positions (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    name        varchar(150) NOT NULL,
    level       integer      NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 10),
    description text,
    is_active   boolean      NOT NULL DEFAULT true,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_positions PRIMARY KEY (id),
    CONSTRAINT uq_positions_name UNIQUE (name)
);

-- ── auth ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auth.credentials (
    id                    uuid         NOT NULL DEFAULT gen_random_uuid(),
    user_id               uuid         NOT NULL,
    email                 varchar(255) NOT NULL,
    password_hash         text         NOT NULL,
    is_active             boolean      NOT NULL DEFAULT true,
    last_login_at         timestamptz,
    failed_login_attempts integer      NOT NULL DEFAULT 0,
    login_locked_until    timestamptz,
    force_password_change boolean      NOT NULL DEFAULT false,
    otp_enabled           boolean      NOT NULL DEFAULT false,
    created_at            timestamptz  NOT NULL DEFAULT now(),
    updated_at            timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_credentials PRIMARY KEY (id),
    CONSTRAINT credentials_email_key UNIQUE (email),
    CONSTRAINT credentials_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS auth.email_otp (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL,
    code_hash  text        NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    attempts   integer     NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_email_otp PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS auth.mfa_settings (
    id                         uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id                    uuid        NOT NULL,
    totp_secret                text,
    totp_enabled               boolean     NOT NULL DEFAULT false,
    totp_last_verified_at      timestamptz,
    email_otp_enabled          boolean     NOT NULL DEFAULT false,
    email_otp_last_verified_at timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_mfa_settings PRIMARY KEY (id),
    CONSTRAINT mfa_settings_user_id_key UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS auth.password_resets (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL,
    token_hash text        NOT NULL,
    expires_at timestamptz NOT NULL,
    used_at    timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_password_resets PRIMARY KEY (id),
    CONSTRAINT password_resets_token_hash_key UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS auth.refresh_tokens (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id    uuid        NOT NULL,
    token_hash text        NOT NULL,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    ip_address inet,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_refresh_tokens PRIMARY KEY (id),
    CONSTRAINT uq_refresh_tokens_hash UNIQUE (token_hash)
);

CREATE TABLE IF NOT EXISTS auth.sessions (
    id               uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id          uuid        NOT NULL,
    ip_address       inet,
    user_agent       text,
    expires_at       timestamptz NOT NULL,
    ended_at         timestamptz,
    geo_city         varchar(100),
    geo_country      varchar(100),
    geo_country_code char(2),
    geo_lat          numeric(8,5),
    geo_lon          numeric(8,5),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_sessions PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS auth.token_revocation_list (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    jti        uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    revoked_at timestamptz NOT NULL DEFAULT now(),
    reason     varchar(100),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_token_revocation_list PRIMARY KEY (id),
    CONSTRAINT token_revocation_list_jti_key UNIQUE (jti)
);

-- ── config ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS config.global_roles (
    id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
    name                    varchar(50) NOT NULL,
    description             text,
    is_active               boolean     NOT NULL DEFAULT true,
    scheduled_hard_delete_at timestamptz,
    deleted_at              timestamptz,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_global_roles PRIMARY KEY (id),
    CONSTRAINT global_roles_name_key UNIQUE (name)
);

CREATE TABLE IF NOT EXISTS config.feature_flags (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    module_id   uuid,
    flag_key    varchar(100) NOT NULL,
    is_enabled  boolean      NOT NULL DEFAULT false,
    description text,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_feature_flags PRIMARY KEY (id),
    CONSTRAINT feature_flags_module_id_flag_key_key UNIQUE (module_id, flag_key)
);

CREATE TABLE IF NOT EXISTS config.module_settings (
    id           uuid         NOT NULL DEFAULT gen_random_uuid(),
    module_id    uuid,
    key          varchar(100) NOT NULL,
    value        text         NOT NULL,
    value_type   varchar(10)  NOT NULL,
    description  text,
    version      integer      NOT NULL DEFAULT 1,
    is_active    boolean      NOT NULL DEFAULT true,
    deprecated_at timestamptz,
    updated_by   uuid,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_module_settings PRIMARY KEY (id),
    CONSTRAINT module_settings_value_type_check CHECK (value_type IN ('string','int','bool','json'))
);

CREATE TABLE IF NOT EXISTS config.sla_rules (
    id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
    request_type            varchar(50),
    priority                varchar(20) NOT NULL,
    hours_to_resolve        integer     NOT NULL CHECK (hours_to_resolve > 0),
    hours_to_first_response integer     NOT NULL DEFAULT 1 CHECK (hours_to_first_response > 0),
    is_active               boolean     NOT NULL DEFAULT true,
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_config_sla_rules PRIMARY KEY (id),
    CONSTRAINT uq_sla_type_priority UNIQUE (request_type, priority),
    CONSTRAINT sla_rules_priority_check CHECK (priority IN ('baja','media','alta','critica'))
);

CREATE TABLE IF NOT EXISTS config.priority_rules (
    id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
    request_type       varchar(50) NOT NULL,
    base_priority      varchar(20) NOT NULL DEFAULT 'media',
    position_level_min integer,
    elevated_priority  varchar(20),
    notes              text,
    is_active          boolean     NOT NULL DEFAULT true,
    created_at         timestamptz NOT NULL DEFAULT now(),
    updated_at         timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_priority_rules PRIMARY KEY (id),
    CONSTRAINT uq_priority_rules_type UNIQUE (request_type),
    CONSTRAINT priority_rules_base_check CHECK (base_priority IN ('baja','media','alta','critica')),
    CONSTRAINT priority_rules_elevated_check CHECK (elevated_priority IS NULL OR elevated_priority IN ('baja','media','alta','critica'))
);

CREATE TABLE IF NOT EXISTS config.request_type_config (
    id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
    type_key              varchar(50) NOT NULL,
    label                 varchar(100) NOT NULL,
    description           text,
    is_active             boolean     NOT NULL DEFAULT true,
    requires_module       boolean     NOT NULL DEFAULT false,
    allows_manual_priority boolean    NOT NULL DEFAULT false,
    sort_order            integer     NOT NULL DEFAULT 0,
    created_at            timestamptz NOT NULL DEFAULT now(),
    updated_at            timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_request_type_config PRIMARY KEY (id),
    CONSTRAINT uq_request_type_key UNIQUE (type_key)
);

CREATE TABLE IF NOT EXISTS config.permission_definitions (
    key        varchar(100) NOT NULL,
    label      varchar(200) NOT NULL,
    description text,
    parent_key varchar(100) REFERENCES config.permission_definitions(key) DEFERRABLE INITIALLY DEFERRED,
    scope      varchar(50)  NOT NULL,
    section    varchar(50)  NOT NULL,
    action     varchar(50)  NOT NULL,
    sort_order integer      NOT NULL DEFAULT 0,
    is_active  boolean      NOT NULL DEFAULT true,
    created_at timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_permission_definitions PRIMARY KEY (key)
);

CREATE TABLE IF NOT EXISTS config.role_permission_grants (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    role_id        uuid        NOT NULL,
    role_type      varchar(20) NOT NULL CHECK (role_type IN ('global','module')),
    permission_key varchar(100) NOT NULL REFERENCES config.permission_definitions(key),
    created_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_role_permission_grants PRIMARY KEY (id),
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_key)
);

-- ── modules ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS modules.modules (
    id                  uuid         NOT NULL DEFAULT gen_random_uuid(),
    name                varchar(100) NOT NULL,
    slug                varchar(100) NOT NULL,
    description         text,
    type                varchar(50)  NOT NULL,
    is_active           boolean      NOT NULL DEFAULT true,
    image_url           text,
    color               varchar(20),
    permission_scope    varchar(50),
    is_builtin          boolean      NOT NULL DEFAULT false,
    maintenance_mode    boolean      NOT NULL DEFAULT false,
    maintenance_by      uuid,
    maintenance_since   timestamptz,
    maintenance_message text,
    scheduled_hard_delete_at timestamptz,
    deleted_at          timestamptz,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_modules PRIMARY KEY (id),
    CONSTRAINT modules_slug_key UNIQUE (slug)
);

CREATE TABLE IF NOT EXISTS modules.module_roles (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    module_id   uuid        NOT NULL,
    name        varchar(50) NOT NULL,
    description text,
    is_active   boolean     NOT NULL DEFAULT true,
    is_admin    boolean     NOT NULL DEFAULT false,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_module_roles PRIMARY KEY (id),
    CONSTRAINT module_roles_module_id_name_key UNIQUE (module_id, name)
);

CREATE TABLE IF NOT EXISTS modules.user_module_roles (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL,
    module_id   uuid        NOT NULL,
    role_id     uuid        NOT NULL,
    assigned_by uuid        NOT NULL,
    assigned_at timestamptz NOT NULL DEFAULT now(),
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_user_module_roles PRIMARY KEY (id),
    CONSTRAINT user_module_roles_user_id_module_id_role_id_key UNIQUE (user_id, module_id, role_id)
);

CREATE TABLE IF NOT EXISTS modules.categories (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    module_id   uuid         NOT NULL,
    parent_id   uuid,
    name        varchar(100) NOT NULL,
    description text,
    is_active   boolean      NOT NULL DEFAULT true,
    deleted_at  timestamptz,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_categories PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS modules.locations (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    module_id   uuid         NOT NULL,
    name        varchar(100) NOT NULL,
    address     text,
    is_active   boolean      NOT NULL DEFAULT true,
    deleted_at  timestamptz,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_locations PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS modules.environments (
    id          uuid         NOT NULL DEFAULT gen_random_uuid(),
    location_id uuid         NOT NULL,
    module_id   uuid         NOT NULL,
    name        varchar(100) NOT NULL,
    description text,
    is_active   boolean      NOT NULL DEFAULT true,
    deleted_at  timestamptz,
    created_at  timestamptz  NOT NULL DEFAULT now(),
    updated_at  timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_environments PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS modules.technician_status (
    id               uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id          uuid        NOT NULL,
    module_id        uuid        NOT NULL,
    is_available     boolean     NOT NULL DEFAULT true,
    status           varchar(30) NOT NULL DEFAULT 'disponible',
    reason           varchar(50),
    unavailable_from timestamptz,
    unavailable_to   timestamptz,
    notes            text,
    created_by       uuid,
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_status PRIMARY KEY (id),
    CONSTRAINT technician_status_user_id_module_id_key UNIQUE (user_id, module_id),
    CONSTRAINT technician_status_reason_check CHECK (reason IN ('vacation','maternity_leave','sick_leave','training','other')),
    CONSTRAINT technician_status_status_check CHECK (status IN ('disponible','ocupado','en_reunion','fuera_horario','ausente','offline'))
);

CREATE TABLE IF NOT EXISTS modules.technician_assignment_log (
    id              uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id         uuid        NOT NULL,
    module_id       uuid        NOT NULL,
    ticket_id       uuid        NOT NULL,
    assigned_at     timestamptz NOT NULL DEFAULT now(),
    assigned_by     varchar(50) NOT NULL DEFAULT 'system',
    assignment_order integer    NOT NULL DEFAULT 0,
    category_slug   varchar(100),
    is_active       boolean     NOT NULL DEFAULT true,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_assignment_log PRIMARY KEY (id),
    CONSTRAINT technician_assignment_log_assigned_by_check CHECK (assigned_by IN ('system','admin','manual'))
);

-- ── requests ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS requests.admin_requests (
    id               uuid         NOT NULL DEFAULT gen_random_uuid(),
    requester_id     uuid         NOT NULL,
    type             varchar(50)  NOT NULL,
    title            varchar(200) NOT NULL,
    description      text         NOT NULL,
    status           varchar(20)  NOT NULL DEFAULT 'pending',
    priority         varchar(20)  NOT NULL DEFAULT 'media',
    auto_priority    boolean      NOT NULL DEFAULT false,
    assigned_to      uuid,
    reviewed_by      uuid,
    reviewed_at      timestamptz,
    review_notes     text,
    taken_by         uuid,
    taken_at         timestamptz,
    sla_due_at       timestamptz,
    task_source      varchar(20)  NOT NULL DEFAULT 'user',
    escalated        boolean      NOT NULL DEFAULT false,
    escalated_by     uuid,
    escalated_at     timestamptz,
    escalation_note  text,
    metadata         jsonb,
    scheduled_hard_delete_at timestamptz,
    deleted_at       timestamptz,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_admin_requests PRIMARY KEY (id),
    CONSTRAINT admin_requests_status_check CHECK (status IN ('pending','taken','in_progress','completed','rejected','cancelled','under_review','approved')),
    CONSTRAINT admin_requests_priority_check CHECK (priority IN ('baja','media','alta','critica')),
    CONSTRAINT chk_requests_task_source CHECK (task_source IN ('user','system'))
);

CREATE TABLE IF NOT EXISTS requests.request_timeline (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    request_id  uuid        NOT NULL,
    actor_id    uuid        NOT NULL,
    action      varchar(50) NOT NULL,
    old_status  varchar(20),
    new_status  varchar(20),
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_request_timeline PRIMARY KEY (id)
);

-- ── calendar ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS calendar.events (
    id              uuid         NOT NULL DEFAULT gen_random_uuid(),
    title           varchar(200) NOT NULL,
    description     text,
    event_type      varchar(20)  NOT NULL DEFAULT 'personal',
    visibility      varchar(20)  NOT NULL DEFAULT 'private',
    module_id       uuid,
    created_by      uuid         NOT NULL,
    ticket_id       uuid,
    request_id      uuid,
    start_at        timestamptz  NOT NULL,
    end_at          timestamptz  NOT NULL,
    all_day         boolean      NOT NULL DEFAULT false,
    priority        priority_level NOT NULL DEFAULT 'media',
    status          varchar(20)  NOT NULL DEFAULT 'active',
    color           varchar(20),
    source          varchar(20)  NOT NULL DEFAULT 'manual',
    created_via     varchar(20)  NOT NULL DEFAULT 'manual',
    recurrence_rule text,
    deleted_at      timestamptz,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_events PRIMARY KEY (id),
    CONSTRAINT chk_cal_end_after_start CHECK (end_at >= start_at),
    CONSTRAINT events_event_type_check CHECK (event_type IN ('personal','module','global')),
    CONSTRAINT events_visibility_check CHECK (visibility IN ('private','module','participants','global')),
    CONSTRAINT events_status_check CHECK (status IN ('active','completed','cancelled')),
    CONSTRAINT events_source_check CHECK (source IN ('manual','ticket','request','sla','system','meeting')),
    CONSTRAINT events_created_via_check CHECK (created_via IN ('manual','ticket_auto','sla_auto','request_auto','meeting_auto'))
);

CREATE TABLE IF NOT EXISTS calendar.event_participants (
    id               uuid        NOT NULL DEFAULT gen_random_uuid(),
    event_id         uuid        NOT NULL,
    user_id          uuid,
    role_name        varchar(50),
    module_id        uuid,
    participant_type varchar(10) NOT NULL DEFAULT 'user',
    status           varchar(20) NOT NULL DEFAULT 'invited',
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_event_participants PRIMARY KEY (id),
    CONSTRAINT event_participants_participant_type_check CHECK (participant_type IN ('user','role')),
    CONSTRAINT event_participants_status_check CHECK (status IN ('invited','accepted','declined')),
    CONSTRAINT chk_ep_user_xor_role CHECK (
        (participant_type = 'user' AND user_id IS NOT NULL AND role_name IS NULL) OR
        (participant_type = 'role' AND role_name IS NOT NULL AND user_id IS NULL))
);

-- ── tickets ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tickets.workflow_versions (
    id           uuid    NOT NULL DEFAULT gen_random_uuid(),
    module_id    uuid    NOT NULL,
    version      integer NOT NULL,
    description  text,
    is_active    boolean NOT NULL DEFAULT false,
    deprecated_at timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_workflow_versions PRIMARY KEY (id),
    CONSTRAINT workflow_versions_module_id_version_key UNIQUE (module_id, version)
);

CREATE TABLE IF NOT EXISTS tickets.states (
    id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
    workflow_version_id uuid        NOT NULL,
    module_id           uuid        NOT NULL,
    name                varchar(50) NOT NULL,
    label               varchar(100) NOT NULL,
    is_initial          boolean     NOT NULL DEFAULT false,
    is_final            boolean     NOT NULL DEFAULT false,
    is_active           boolean     NOT NULL DEFAULT true,
    version             integer     NOT NULL DEFAULT 1,
    deprecated_at       timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_states PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tickets.transitions (
    id                  uuid         NOT NULL DEFAULT gen_random_uuid(),
    workflow_version_id uuid         NOT NULL,
    module_id           uuid         NOT NULL,
    from_state_id       uuid         NOT NULL,
    to_state_id         uuid         NOT NULL,
    name                varchar(100) NOT NULL,
    is_active           boolean      NOT NULL DEFAULT true,
    version             integer      NOT NULL DEFAULT 1,
    deprecated_at       timestamptz,
    created_at          timestamptz  NOT NULL DEFAULT now(),
    updated_at          timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_transitions PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tickets.transition_rules (
    id                   uuid        NOT NULL DEFAULT gen_random_uuid(),
    transition_id        uuid        NOT NULL,
    role_name            varchar(50) NOT NULL,
    condition_expression text,
    action_type          action_type NOT NULL,
    action_payload       jsonb,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_transition_rules PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS tickets.sla_policies (
    id           uuid         NOT NULL DEFAULT gen_random_uuid(),
    module_id    uuid         NOT NULL,
    name         varchar(100) NOT NULL,
    description  text,
    version      integer      NOT NULL DEFAULT 1,
    is_active    boolean      NOT NULL DEFAULT false,
    deprecated_at timestamptz,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_sla_policies PRIMARY KEY (id),
    CONSTRAINT sla_policies_module_id_name_version_key UNIQUE (module_id, name, version)
);

CREATE TABLE IF NOT EXISTS tickets.sla_rules (
    id                   uuid          NOT NULL DEFAULT gen_random_uuid(),
    policy_id            uuid          NOT NULL,
    priority_result      priority_level NOT NULL,
    resolution_time_hours integer      NOT NULL,
    rule_order           integer       NOT NULL,
    valid_from           timestamptz,
    valid_until          timestamptz,
    created_at           timestamptz   NOT NULL DEFAULT now(),
    updated_at           timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT pk_sla_rules PRIMARY KEY (id),
    CONSTRAINT sla_rules_resolution_time_hours_check CHECK (resolution_time_hours > 0)
);

CREATE TABLE IF NOT EXISTS tickets.sla_conditions (
    id            uuid        NOT NULL DEFAULT gen_random_uuid(),
    rule_id       uuid        NOT NULL,
    field         varchar(100) NOT NULL,
    operator      varchar(10) NOT NULL,
    value         text        NOT NULL,
    logical_group integer     NOT NULL,
    order_index   integer     NOT NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_sla_conditions PRIMARY KEY (id),
    CONSTRAINT sla_conditions_operator_check CHECK (operator IN ('=','!=','>','<','>=','<=','IN'))
);

CREATE TABLE IF NOT EXISTS tickets.assignment_policies (
    id                          uuid              NOT NULL DEFAULT gen_random_uuid(),
    module_id                   uuid              NOT NULL,
    use_specialists             boolean           NOT NULL DEFAULT true,
    use_generalists             boolean           NOT NULL DEFAULT true,
    specialist_overflow_enabled boolean           NOT NULL DEFAULT true,
    specialist_overflow_threshold integer         NOT NULL DEFAULT 5,
    assignment_method           assignment_method NOT NULL DEFAULT 'round_robin',
    updated_by                  uuid,
    created_at                  timestamptz       NOT NULL DEFAULT now(),
    updated_at                  timestamptz       NOT NULL DEFAULT now(),
    CONSTRAINT pk_assignment_policies PRIMARY KEY (id),
    CONSTRAINT assignment_policies_module_id_key UNIQUE (module_id)
);

CREATE TABLE IF NOT EXISTS tickets.technician_profiles (
    id              uuid             NOT NULL DEFAULT gen_random_uuid(),
    user_id         uuid             NOT NULL,
    module_id       uuid             NOT NULL,
    technician_type technician_type  NOT NULL DEFAULT 'generalist',
    max_daily_tickets integer,
    is_active       boolean          NOT NULL DEFAULT true,
    created_at      timestamptz      NOT NULL DEFAULT now(),
    updated_at      timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_profiles PRIMARY KEY (id),
    CONSTRAINT technician_profiles_user_id_module_id_key UNIQUE (user_id, module_id)
);

CREATE TABLE IF NOT EXISTS tickets.technician_category_skills (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL,
    module_id   uuid        NOT NULL,
    category_id uuid        NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_category_skills PRIMARY KEY (id),
    CONSTRAINT technician_category_skills_user_id_module_id_category_id_key UNIQUE (user_id, module_id, category_id)
);

CREATE TABLE IF NOT EXISTS tickets.technician_availability (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL,
    module_id   uuid        NOT NULL,
    day_of_week smallint    NOT NULL,
    start_time  time        NOT NULL,
    end_time    time        NOT NULL,
    is_active   boolean     NOT NULL DEFAULT true,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_availability PRIMARY KEY (id),
    CONSTRAINT technician_availability_day_of_week_check CHECK (day_of_week BETWEEN 0 AND 6)
);

CREATE TABLE IF NOT EXISTS tickets.technician_leaves (
    id          uuid    NOT NULL DEFAULT gen_random_uuid(),
    user_id     uuid    NOT NULL,
    start_date  date    NOT NULL,
    end_date    date    NOT NULL,
    reason      text,
    approved_by uuid,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_technician_leaves PRIMARY KEY (id),
    CONSTRAINT uq_tech_leaves_no_overlap EXCLUDE USING gist (user_id WITH =, daterange(start_date, end_date, '[]') WITH &&)
);

CREATE TABLE IF NOT EXISTS tickets.ticket_assignment_counters (
    id                   uuid             NOT NULL DEFAULT gen_random_uuid(),
    module_id            uuid             NOT NULL,
    environment_id       uuid             NOT NULL,
    category_id          uuid,
    technician_type      technician_type  NOT NULL DEFAULT 'generalist',
    last_assigned_user_id uuid,
    assignment_count     bigint           NOT NULL DEFAULT 0,
    created_at           timestamptz      NOT NULL DEFAULT now(),
    updated_at           timestamptz      NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_assignment_counters PRIMARY KEY (id)
);

-- Particionada por HASH(ticket_id) × 8
CREATE TABLE IF NOT EXISTS tickets.ticket_assignments (
    id          uuid            NOT NULL DEFAULT gen_random_uuid(),
    ticket_id   uuid            NOT NULL,
    user_id     uuid            NOT NULL,
    role        assignment_role NOT NULL,
    assigned_by uuid            NOT NULL,
    assigned_at timestamptz     NOT NULL DEFAULT now(),
    unassigned_at timestamptz,
    is_active   boolean         NOT NULL DEFAULT true,
    created_at  timestamptz     NOT NULL DEFAULT now(),
    updated_at  timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_assignments PRIMARY KEY (id, ticket_id)
) PARTITION BY HASH (ticket_id);

-- Particionada por RANGE(created_at) mensual
CREATE TABLE IF NOT EXISTS tickets.tickets (
    id                  uuid           NOT NULL DEFAULT gen_random_uuid(),
    module_id           uuid           NOT NULL,
    workflow_version_id uuid           NOT NULL,
    current_state_id    uuid           NOT NULL,
    environment_id      uuid           NOT NULL,
    category_id         uuid           NOT NULL,
    created_by          uuid           NOT NULL,
    sla_policy_id       uuid           NOT NULL,
    priority            priority_level NOT NULL DEFAULT 'media',
    urgency             urgency_level  NOT NULL DEFAULT 'media',
    impact              impact_level   NOT NULL DEFAULT 'medio',
    sla_deadline        timestamptz,
    reprocess_count     integer        NOT NULL DEFAULT 0,
    version             integer        NOT NULL DEFAULT 1,
    title               varchar(255)   NOT NULL,
    description         text,
    created_at          timestamptz    NOT NULL DEFAULT now(),
    updated_at          timestamptz    NOT NULL DEFAULT now(),
    CONSTRAINT pk_tickets PRIMARY KEY (id, created_at),
    CONSTRAINT tickets_reprocess_count_check CHECK (reprocess_count <= 1)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS tickets.ticket_approvals (
    id             uuid            NOT NULL DEFAULT gen_random_uuid(),
    ticket_id      uuid            NOT NULL,
    user_id        uuid            NOT NULL,
    token          varchar(255)    NOT NULL,
    status         approval_status NOT NULL DEFAULT 'pending',
    signature_hash text,
    ip_address     inet,
    user_agent     text,
    approved_at    timestamptz,
    expires_at     timestamptz     NOT NULL,
    created_at     timestamptz     NOT NULL DEFAULT now(),
    updated_at     timestamptz     NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_approvals PRIMARY KEY (id),
    CONSTRAINT ticket_approvals_token_key UNIQUE (token)
);

CREATE TABLE IF NOT EXISTS tickets.ticket_sla_tracking (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id      uuid        NOT NULL,
    sla_policy_id  uuid        NOT NULL,
    sla_rule_id    uuid        NOT NULL,
    started_at     timestamptz NOT NULL,
    deadline_at    timestamptz NOT NULL,
    paused_at      timestamptz,
    resumed_at     timestamptz,
    breached_at    timestamptz,
    status         varchar(20) NOT NULL DEFAULT 'active',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_sla_tracking PRIMARY KEY (id),
    CONSTRAINT ticket_sla_tracking_ticket_id_key UNIQUE (ticket_id),
    CONSTRAINT ticket_sla_tracking_status_check CHECK (status IN ('active','paused','met','breached'))
);

-- Particionada por RANGE(created_at) mensual
CREATE TABLE IF NOT EXISTS tickets.ticket_comments (
    id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id    uuid        NOT NULL,
    user_id      uuid        NOT NULL,
    comment_type varchar(20) NOT NULL,
    content      text        NOT NULL,
    attachments  jsonb,
    deleted_at   timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_comments PRIMARY KEY (id, created_at),
    CONSTRAINT ticket_comments_comment_type_check CHECK (comment_type IN ('internal','public'))
) PARTITION BY RANGE (created_at);

-- Particionada por RANGE(transitioned_at) mensual
CREATE TABLE IF NOT EXISTS tickets.ticket_state_history (
    id                uuid        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id         uuid        NOT NULL,
    from_state_id     uuid        NOT NULL,
    to_state_id       uuid        NOT NULL,
    transitioned_by   uuid        NOT NULL,
    transition_reason text,
    transitioned_at   timestamptz NOT NULL DEFAULT now(),
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_state_history PRIMARY KEY (id, transitioned_at)
) PARTITION BY RANGE (transitioned_at);

CREATE TABLE IF NOT EXISTS tickets.ticket_meetings (
    id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id           uuid        NOT NULL,
    module_id           uuid        NOT NULL,
    created_by          uuid        NOT NULL,
    provider            varchar(20) NOT NULL DEFAULT 'google_meet',
    meeting_url         text,
    external_meeting_id varchar(200),
    status              varchar(20) NOT NULL DEFAULT 'scheduled',
    reason              text,
    scheduled_at        timestamptz NOT NULL,
    started_at          timestamptz,
    ended_at            timestamptz,
    duration_minutes    integer,
    calendar_event_id   uuid,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_meetings PRIMARY KEY (id),
    CONSTRAINT ticket_meetings_provider_check CHECK (provider IN ('google_meet','teams','zoom','internal')),
    CONSTRAINT ticket_meetings_status_check CHECK (status IN ('scheduled','active','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS tickets.meeting_participants (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    meeting_id uuid        NOT NULL,
    user_id    uuid        NOT NULL,
    role       varchar(20) NOT NULL DEFAULT 'attendee',
    joined_at  timestamptz,
    left_at    timestamptz,
    CONSTRAINT pk_meeting_participants PRIMARY KEY (id),
    CONSTRAINT meeting_participants_role_check CHECK (role IN ('host','attendee','observer'))
);

CREATE TABLE IF NOT EXISTS tickets.ticket_ratings (
    id                         uuid        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id                  uuid        NOT NULL,
    rated_by                   uuid        NOT NULL,
    technician_id              uuid        NOT NULL,
    score_attention            smallint,
    score_clarity              smallint,
    score_response_time        smallint,
    score_quality              smallint,
    score_overall              smallint,
    service_label              varchar(20),
    comment                    text,
    would_recommend            boolean,
    resolved_on_first_attempt  boolean,
    expires_at                 timestamptz NOT NULL,
    is_expired                 boolean     NOT NULL DEFAULT false,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_ratings PRIMARY KEY (id),
    CONSTRAINT uq_ticket_ratings_ticket UNIQUE (ticket_id),
    CONSTRAINT ticket_ratings_score_attention_check CHECK (score_attention BETWEEN 1 AND 5),
    CONSTRAINT ticket_ratings_score_clarity_check CHECK (score_clarity BETWEEN 1 AND 5),
    CONSTRAINT ticket_ratings_score_response_time_check CHECK (score_response_time BETWEEN 1 AND 5),
    CONSTRAINT ticket_ratings_score_quality_check CHECK (score_quality BETWEEN 1 AND 5),
    CONSTRAINT ticket_ratings_score_overall_check CHECK (score_overall BETWEEN 1 AND 5),
    CONSTRAINT ticket_ratings_service_label_check CHECK (service_label IN ('excelente','bueno','regular','deficiente'))
);

-- ── inventory ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory.assets (
    id             uuid         NOT NULL DEFAULT gen_random_uuid(),
    module_id      uuid         NOT NULL,
    environment_id uuid         NOT NULL,
    category_id    uuid         NOT NULL,
    parent_asset_id uuid,
    name           varchar(255) NOT NULL,
    description    text,
    specifications jsonb,
    qr_code        varchar(100) NOT NULL,
    serial_number  varchar(100),
    status         asset_status NOT NULL DEFAULT 'disponible',
    version        integer      NOT NULL DEFAULT 1,
    deleted_at     timestamptz,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_assets PRIMARY KEY (id),
    CONSTRAINT assets_qr_code_key UNIQUE (qr_code)
);

CREATE TABLE IF NOT EXISTS inventory.asset_assignments (
    id           uuid        NOT NULL DEFAULT gen_random_uuid(),
    asset_id     uuid        NOT NULL,
    user_id      uuid        NOT NULL,
    assigned_by  uuid        NOT NULL,
    request_id   uuid,
    assigned_at  timestamptz NOT NULL DEFAULT now(),
    unassigned_at timestamptz,
    status       varchar(20) NOT NULL DEFAULT 'activo',
    notes        text,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_assignments PRIMARY KEY (id),
    CONSTRAINT asset_assignments_status_check CHECK (status IN ('activo','devuelto','transferido'))
);

CREATE TABLE IF NOT EXISTS inventory.asset_assignment_history (
    id            uuid        NOT NULL DEFAULT gen_random_uuid(),
    asset_id      uuid        NOT NULL,
    user_id       uuid        NOT NULL,
    assigned_by   uuid        NOT NULL,
    assignment_id uuid,
    action        varchar(30) NOT NULL,
    reason        text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_assignment_history PRIMARY KEY (id),
    CONSTRAINT asset_assignment_history_action_check CHECK (action IN ('asignado','devuelto','transferido','dado_de_baja','reparacion'))
);

CREATE TABLE IF NOT EXISTS inventory.asset_relationships (
    id                uuid        NOT NULL DEFAULT gen_random_uuid(),
    parent_asset_id   uuid        NOT NULL,
    child_asset_id    uuid        NOT NULL,
    relationship_type varchar(50) NOT NULL,
    created_at        timestamptz NOT NULL DEFAULT now(),
    updated_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_relationships PRIMARY KEY (id),
    CONSTRAINT asset_relationships_parent_asset_id_child_asset_id_key UNIQUE (parent_asset_id, child_asset_id)
);

CREATE TABLE IF NOT EXISTS inventory.asset_requests (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    module_id      uuid        NOT NULL,
    user_id        uuid        NOT NULL,
    category_id    uuid        NOT NULL,
    subcategory_id uuid,
    description    text,
    quantity       integer     NOT NULL DEFAULT 1,
    justification  text        NOT NULL,
    status         varchar(20) NOT NULL DEFAULT 'pending',
    reviewed_by    uuid,
    reviewed_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_requests PRIMARY KEY (id),
    CONSTRAINT asset_requests_quantity_check CHECK (quantity > 0),
    CONSTRAINT asset_requests_status_check CHECK (status IN ('pending','approved','rejected','fulfilled'))
);

CREATE TABLE IF NOT EXISTS inventory.asset_procurement_requests (
    id             uuid        NOT NULL DEFAULT gen_random_uuid(),
    module_id      uuid        NOT NULL,
    requested_by   uuid        NOT NULL,
    category_id    uuid        NOT NULL,
    quantity       integer     NOT NULL,
    justification  text        NOT NULL,
    status         varchar(20) NOT NULL DEFAULT 'pending',
    approved_by    uuid,
    approved_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_asset_procurement_requests PRIMARY KEY (id),
    CONSTRAINT asset_procurement_requests_quantity_check CHECK (quantity > 0),
    CONSTRAINT asset_procurement_requests_status_check CHECK (status IN ('pending','approved','rejected','fulfilled'))
);

CREATE TABLE IF NOT EXISTS inventory.ticket_assets (
    id         uuid        NOT NULL DEFAULT gen_random_uuid(),
    ticket_id  uuid        NOT NULL,
    asset_id   uuid        NOT NULL,
    notes      text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_ticket_assets PRIMARY KEY (id),
    CONSTRAINT ticket_assets_ticket_id_asset_id_key UNIQUE (ticket_id, asset_id)
);

-- ── files, notifications, audit, events ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS files.files (
    id           uuid         NOT NULL DEFAULT gen_random_uuid(),
    uploaded_by  uuid         NOT NULL,
    entity_type  varchar(50)  NOT NULL,
    entity_id    uuid         NOT NULL,
    file_name    varchar(255) NOT NULL,
    file_size    bigint       NOT NULL,
    mime_type    varchar(100) NOT NULL,
    storage_url  text         NOT NULL,
    is_confirmed boolean      NOT NULL DEFAULT false,
    expires_at   timestamptz,
    deleted_at   timestamptz,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_files PRIMARY KEY (id),
    CONSTRAINT files_file_size_check CHECK (file_size > 0)
);

CREATE TABLE IF NOT EXISTS notifications.notification_templates (
    id           uuid                 NOT NULL DEFAULT gen_random_uuid(),
    event_type   varchar(100)         NOT NULL,
    channel      notification_channel NOT NULL,
    subject      varchar(255),
    template_body text                NOT NULL,
    variables    jsonb                NOT NULL DEFAULT '[]',
    is_active    boolean              NOT NULL DEFAULT true,
    created_at   timestamptz          NOT NULL DEFAULT now(),
    updated_at   timestamptz          NOT NULL DEFAULT now(),
    CONSTRAINT pk_notification_templates PRIMARY KEY (id),
    CONSTRAINT notification_templates_event_type_channel_key UNIQUE (event_type, channel)
);

CREATE TABLE IF NOT EXISTS notifications.notification_logs (
    id           uuid                 NOT NULL DEFAULT gen_random_uuid(),
    user_id      uuid                 NOT NULL,
    template_id  uuid,
    event_type   varchar(100)         NOT NULL,
    channel      notification_channel NOT NULL,
    status       notification_status  NOT NULL DEFAULT 'pending',
    payload      jsonb                NOT NULL,
    error_message text,
    sent_at      timestamptz,
    created_at   timestamptz          NOT NULL DEFAULT now(),
    updated_at   timestamptz          NOT NULL DEFAULT now(),
    CONSTRAINT pk_notification_logs PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS audit.event_log (
    id          uuid        NOT NULL DEFAULT gen_random_uuid(),
    actor_id    uuid,
    actor_type  actor_type  NOT NULL,
    action      varchar(100) NOT NULL,
    entity_type varchar(50) NOT NULL,
    entity_id   uuid        NOT NULL,
    old_value   jsonb,
    new_value   jsonb,
    ip_address  inet,
    user_agent  text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT pk_event_log PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

CREATE TABLE IF NOT EXISTS events.outbox (
    id             uuid         NOT NULL DEFAULT gen_random_uuid(),
    aggregate_type varchar(50)  NOT NULL,
    aggregate_id   uuid         NOT NULL,
    event_type     varchar(100) NOT NULL,
    payload        jsonb        NOT NULL,
    status         outbox_status NOT NULL DEFAULT 'pending',
    retries        smallint     NOT NULL DEFAULT 0,
    last_error     text,
    scheduled_at   timestamptz  NOT NULL DEFAULT now(),
    processed_at   timestamptz,
    created_at     timestamptz  NOT NULL DEFAULT now(),
    updated_at     timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT pk_outbox PRIMARY KEY (id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 6: Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- audit
CREATE INDEX IF NOT EXISTS idx_audit_actor      ON audit.event_log (actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit.event_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity     ON audit.event_log (entity_type, entity_id);

-- auth
CREATE INDEX IF NOT EXISTS idx_auth_credentials_email   ON auth.credentials (email);
CREATE INDEX IF NOT EXISTS idx_auth_credentials_user_id ON auth.credentials (user_id);
CREATE INDEX IF NOT EXISTS idx_email_otp_lookup         ON auth.email_otp (user_id, expires_at) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_mfa_settings_user        ON auth.mfa_settings (user_id);
CREATE INDEX IF NOT EXISTS idx_pr_token                 ON auth.password_resets (token_hash);
CREATE INDEX IF NOT EXISTS idx_pr_user                  ON auth.password_resets (user_id);
CREATE INDEX IF NOT EXISTS idx_pw_reset_lookup          ON auth.password_resets (token_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_rt_expires          ON auth.refresh_tokens (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_rt_token_hash       ON auth.refresh_tokens (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_rt_user_id          ON auth.refresh_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires    ON auth.sessions (expires_at) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id    ON auth.sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_trl_expires_at      ON auth.token_revocation_list (expires_at);
CREATE INDEX IF NOT EXISTS idx_auth_trl_jti             ON auth.token_revocation_list (jti);

-- calendar
CREATE INDEX IF NOT EXISTS idx_cal_ep_event_id    ON calendar.event_participants (event_id);
CREATE INDEX IF NOT EXISTS idx_cal_ep_user_id     ON calendar.event_participants (user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cal_ep_role        ON calendar.event_participants (role_name, module_id) WHERE role_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cal_events_created_by  ON calendar.events (created_by);
CREATE INDEX IF NOT EXISTS idx_cal_events_module_id   ON calendar.events (module_id) WHERE module_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cal_events_start_at    ON calendar.events (start_at);
CREATE INDEX IF NOT EXISTS idx_cal_events_range_active ON calendar.events (start_at, end_at) WHERE deleted_at IS NULL AND status = 'active';
CREATE INDEX IF NOT EXISTS idx_cal_events_type_vis    ON calendar.events (event_type, visibility) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cal_events_ticket_id   ON calendar.events (ticket_id) WHERE ticket_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cal_events_request_id  ON calendar.events (request_id) WHERE request_id IS NOT NULL;

-- config
CREATE INDEX IF NOT EXISTS idx_config_flags_module    ON config.feature_flags (module_id);
CREATE INDEX IF NOT EXISTS idx_config_settings_key    ON config.module_settings (key) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_config_settings_module ON config.module_settings (module_id) WHERE is_active = true;
CREATE UNIQUE INDEX IF NOT EXISTS uq_cms_scope        ON config.module_settings (module_id, key, version) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_rpg_role_type          ON config.role_permission_grants (role_id, role_type);
CREATE INDEX IF NOT EXISTS idx_rpg_key                ON config.role_permission_grants (permission_key);

-- events
CREATE INDEX IF NOT EXISTS idx_events_outbox_aggregate      ON events.outbox (aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_events_outbox_status_scheduled ON events.outbox (status, scheduled_at) WHERE status IN ('pending','failed');

-- files
CREATE INDEX IF NOT EXISTS idx_files_entity      ON files.files (entity_type, entity_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_temporary   ON files.files (expires_at) WHERE is_confirmed = false AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_files_uploaded_by ON files.files (uploaded_by) WHERE deleted_at IS NULL;

-- inventory
CREATE INDEX IF NOT EXISTS idx_inv_aah_asset        ON inventory.asset_assignment_history (asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_aah_user         ON inventory.asset_assignment_history (user_id);
CREATE INDEX IF NOT EXISTS idx_inv_ass_asset_status ON inventory.asset_assignments (asset_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_ass_user_status  ON inventory.asset_assignments (user_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_ar_parent        ON inventory.asset_relationships (parent_asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_ar_child         ON inventory.asset_relationships (child_asset_id);
CREATE INDEX IF NOT EXISTS idx_inv_req_module_status  ON inventory.asset_requests (module_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_req_user_status    ON inventory.asset_requests (user_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_proc_module_status ON inventory.asset_procurement_requests (module_id, status);
CREATE INDEX IF NOT EXISTS idx_inventory_assets_qr          ON inventory.assets (qr_code);
CREATE INDEX IF NOT EXISTS idx_inventory_assets_category    ON inventory.assets (category_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_env_status  ON inventory.assets (environment_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_assets_status_active ON inventory.assets (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inv_ta_ticket ON inventory.ticket_assets (ticket_id);
CREATE INDEX IF NOT EXISTS idx_inv_ta_asset  ON inventory.ticket_assets (asset_id);

-- modules
CREATE INDEX IF NOT EXISTS idx_modules_categories_module_parent ON modules.categories (module_id, parent_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modules_environments_module      ON modules.environments (module_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modules_environments_location    ON modules.environments (location_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modules_locations_module         ON modules.locations (module_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_modules_roles_module             ON modules.module_roles (module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_modules_active                   ON modules.modules (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_assign_log_module       ON modules.technician_assignment_log (module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_log_user_module  ON modules.technician_assignment_log (user_id, module_id, assigned_at DESC);
CREATE INDEX IF NOT EXISTS idx_assign_log_ticket       ON modules.technician_assignment_log (ticket_id);
CREATE INDEX IF NOT EXISTS idx_assign_log_active       ON modules.technician_assignment_log (module_id, user_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tech_status_user_module ON modules.technician_status (user_id, module_id);
CREATE INDEX IF NOT EXISTS idx_tech_status_module      ON modules.technician_status (module_id) WHERE is_available = true;
CREATE INDEX IF NOT EXISTS idx_tech_status_period      ON modules.technician_status (unavailable_from, unavailable_to) WHERE is_available = false;
CREATE INDEX IF NOT EXISTS idx_umr_user_module         ON modules.user_module_roles (user_id, module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_umr_module_role         ON modules.user_module_roles (module_id, role_id) WHERE is_active = true;

-- notifications
CREATE INDEX IF NOT EXISTS idx_notif_logs_user_status   ON notifications.notification_logs (user_id, status);
CREATE INDEX IF NOT EXISTS idx_notif_logs_event_channel ON notifications.notification_logs (event_type, channel);

-- requests
CREATE INDEX IF NOT EXISTS idx_admin_requests_requester ON requests.admin_requests (requester_id);
CREATE INDEX IF NOT EXISTS idx_admin_requests_status    ON requests.admin_requests (status);
CREATE INDEX IF NOT EXISTS idx_admin_requests_type      ON requests.admin_requests (type);
CREATE INDEX IF NOT EXISTS idx_admin_requests_escalated ON requests.admin_requests (escalated) WHERE escalated = true;
CREATE INDEX IF NOT EXISTS idx_admin_requests_assigned  ON requests.admin_requests (assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_req_timeline_request ON requests.request_timeline (request_id, created_at);
CREATE INDEX IF NOT EXISTS idx_req_timeline_actor   ON requests.request_timeline (actor_id);

-- tickets
CREATE INDEX IF NOT EXISTS idx_tickets_sla_policies_module  ON tickets.sla_policies (module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tickets_sla_rules_policy     ON tickets.sla_rules (policy_id);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_conditions_rule_group ON tickets.sla_conditions (rule_id, logical_group, order_index);
CREATE INDEX IF NOT EXISTS idx_tickets_states_wfv           ON tickets.states (workflow_version_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tickets_transitions_wfv_from ON tickets.transitions (workflow_version_id, from_state_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tickets_trules_transition     ON tickets.transition_rules (transition_id);
CREATE INDEX IF NOT EXISTS idx_tech_profiles_user_module    ON tickets.technician_profiles (user_id, module_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tech_profiles_module_type    ON tickets.technician_profiles (module_id, technician_type) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_tech_cat_skills_user_module_cat ON tickets.technician_category_skills (user_id, module_id, category_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_technician_availability_user_module_day ON tickets.technician_availability (user_id, module_id, day_of_week) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_technician_leaves_user_dates ON tickets.technician_leaves (user_id, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_tac_module_env              ON tickets.ticket_assignment_counters (module_id, environment_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_tac_pool              ON tickets.ticket_assignment_counters (module_id, environment_id, category_id, technician_type) NULLS NOT DISTINCT;
CREATE INDEX IF NOT EXISTS idx_ta_ticket_active   ON tickets.ticket_assignments (ticket_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_active     ON tickets.ticket_assignments (user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_ta_user_role_active ON tickets.ticket_assignments (user_id, role, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ta_one_active_owner ON tickets.ticket_assignments (ticket_id) WHERE role = 'owner' AND is_active = true;
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_ticket       ON tickets.ticket_approvals (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_token        ON tickets.ticket_approvals (token);
CREATE INDEX IF NOT EXISTS idx_tickets_approvals_status_expires ON tickets.ticket_approvals (status, expires_at);
CREATE INDEX IF NOT EXISTS idx_tickets_comments_ticket  ON tickets.ticket_comments (ticket_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_meetings_ticket_id       ON tickets.ticket_meetings (ticket_id);
CREATE INDEX IF NOT EXISTS idx_meetings_module_id       ON tickets.ticket_meetings (module_id);
CREATE INDEX IF NOT EXISTS idx_meetings_scheduled_at    ON tickets.ticket_meetings (scheduled_at);
CREATE INDEX IF NOT EXISTS idx_meetings_status          ON tickets.ticket_meetings (status) WHERE status IN ('scheduled','active');
CREATE INDEX IF NOT EXISTS idx_meetings_created_by      ON tickets.ticket_meetings (created_by);
CREATE INDEX IF NOT EXISTS idx_meetings_cal_event       ON tickets.ticket_meetings (calendar_event_id) WHERE calendar_event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_mp_meeting_id            ON tickets.meeting_participants (meeting_id);
CREATE INDEX IF NOT EXISTS idx_mp_user_id               ON tickets.meeting_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ticket_id        ON tickets.ticket_ratings (ticket_id);
CREATE INDEX IF NOT EXISTS idx_ratings_technician_id    ON tickets.ticket_ratings (technician_id);
CREATE INDEX IF NOT EXISTS idx_ratings_rated_by         ON tickets.ticket_ratings (rated_by);
CREATE INDEX IF NOT EXISTS idx_ratings_label            ON tickets.ticket_ratings (service_label) WHERE service_label IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ratings_expires_active   ON tickets.ticket_ratings (expires_at) WHERE is_expired = false;
CREATE INDEX IF NOT EXISTS idx_tickets_slat_ticket       ON tickets.ticket_sla_tracking (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_slat_status_deadline ON tickets.ticket_sla_tracking (status, deadline_at);
CREATE INDEX IF NOT EXISTS idx_tickets_tsh_ticket_id    ON tickets.ticket_state_history (ticket_id);
CREATE INDEX IF NOT EXISTS idx_tickets_module_state     ON tickets.tickets (module_id, current_state_id);
CREATE INDEX IF NOT EXISTS idx_tickets_module_priority  ON tickets.tickets (module_id, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tickets_environment      ON tickets.tickets (environment_id);
CREATE INDEX IF NOT EXISTS idx_tickets_created_by       ON tickets.tickets (created_by);
CREATE INDEX IF NOT EXISTS idx_tickets_sla_deadline     ON tickets.tickets (sla_deadline);
CREATE INDEX IF NOT EXISTS idx_tickets_id_lookup        ON tickets.tickets (id);

-- users
CREATE INDEX IF NOT EXISTS idx_users_profiles_active      ON users.profiles (is_active) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_profiles_deleted     ON users.profiles (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_users_profiles_superadmin  ON users.profiles (is_superadmin) WHERE is_superadmin = true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at      ON users.profiles (last_seen_at) WHERE last_seen_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profiles_position          ON users.profiles (position_id) WHERE position_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_username    ON users.profiles (username) WHERE username IS NOT NULL AND deleted_at IS NULL;

-- reports (materialized view index — se crea junto con la vista en Parte 11)
-- idx_reports_tech_load_unique: creado después de la vista materializada

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 7: Foreign Keys
-- ─────────────────────────────────────────────────────────────────────────────

-- users
ALTER TABLE users.preferences ADD CONSTRAINT preferences_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users.profiles(id) ON DELETE CASCADE;
ALTER TABLE users.profiles ADD CONSTRAINT profiles_global_role_id_fkey
    FOREIGN KEY (global_role_id) REFERENCES config.global_roles(id);
-- Note: org.headquarters/departments/areas/positions FKs removed in migration 013.

-- org
ALTER TABLE org.areas ADD CONSTRAINT areas_department_id_fkey
    FOREIGN KEY (department_id) REFERENCES org.departments(id) ON DELETE SET NULL;

-- auth
ALTER TABLE auth.email_otp ADD CONSTRAINT email_otp_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users.profiles(id) ON DELETE CASCADE;

-- config
ALTER TABLE config.role_permission_grants ADD CONSTRAINT rpg_permission_key_fkey
    FOREIGN KEY (permission_key) REFERENCES config.permission_definitions(key);

-- modules
ALTER TABLE modules.categories ADD CONSTRAINT categories_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.categories ADD CONSTRAINT categories_parent_id_fkey
    FOREIGN KEY (parent_id) REFERENCES modules.categories(id) ON DELETE SET NULL;
ALTER TABLE modules.environments ADD CONSTRAINT environments_location_id_fkey
    FOREIGN KEY (location_id) REFERENCES modules.locations(id) ON DELETE CASCADE;
ALTER TABLE modules.environments ADD CONSTRAINT environments_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.locations ADD CONSTRAINT locations_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.module_roles ADD CONSTRAINT module_roles_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.modules ADD CONSTRAINT modules_maintenance_by_fkey
    FOREIGN KEY (maintenance_by) REFERENCES users.profiles(id) ON DELETE SET NULL;
ALTER TABLE modules.technician_assignment_log ADD CONSTRAINT technician_assignment_log_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.technician_status ADD CONSTRAINT technician_status_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.user_module_roles ADD CONSTRAINT user_module_roles_module_id_fkey
    FOREIGN KEY (module_id) REFERENCES modules.modules(id) ON DELETE CASCADE;
ALTER TABLE modules.user_module_roles ADD CONSTRAINT user_module_roles_role_id_fkey
    FOREIGN KEY (role_id) REFERENCES modules.module_roles(id) ON DELETE RESTRICT;

-- requests
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_requester_id_fkey
    FOREIGN KEY (requester_id) REFERENCES users.profiles(id);
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_reviewed_by_fkey
    FOREIGN KEY (reviewed_by) REFERENCES users.profiles(id);
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_taken_by_fkey
    FOREIGN KEY (taken_by) REFERENCES users.profiles(id) ON DELETE SET NULL;
ALTER TABLE requests.admin_requests ADD CONSTRAINT admin_requests_escalated_by_fkey
    FOREIGN KEY (escalated_by) REFERENCES users.profiles(id);
ALTER TABLE requests.request_timeline ADD CONSTRAINT request_timeline_request_id_fkey
    FOREIGN KEY (request_id) REFERENCES requests.admin_requests(id) ON DELETE CASCADE;

-- calendar
ALTER TABLE calendar.event_participants ADD CONSTRAINT event_participants_event_id_fkey
    FOREIGN KEY (event_id) REFERENCES calendar.events(id) ON DELETE CASCADE;

-- tickets
ALTER TABLE tickets.states ADD CONSTRAINT states_workflow_version_id_fkey
    FOREIGN KEY (workflow_version_id) REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE;
ALTER TABLE tickets.transitions ADD CONSTRAINT transitions_workflow_version_id_fkey
    FOREIGN KEY (workflow_version_id) REFERENCES tickets.workflow_versions(id) ON DELETE CASCADE;
ALTER TABLE tickets.transitions ADD CONSTRAINT transitions_from_state_id_fkey
    FOREIGN KEY (from_state_id) REFERENCES tickets.states(id) ON DELETE CASCADE;
ALTER TABLE tickets.transitions ADD CONSTRAINT transitions_to_state_id_fkey
    FOREIGN KEY (to_state_id) REFERENCES tickets.states(id) ON DELETE CASCADE;
ALTER TABLE tickets.transition_rules ADD CONSTRAINT transition_rules_transition_id_fkey
    FOREIGN KEY (transition_id) REFERENCES tickets.transitions(id) ON DELETE CASCADE;
ALTER TABLE tickets.sla_rules ADD CONSTRAINT sla_rules_policy_id_fkey
    FOREIGN KEY (policy_id) REFERENCES tickets.sla_policies(id) ON DELETE CASCADE;
ALTER TABLE tickets.sla_conditions ADD CONSTRAINT sla_conditions_rule_id_fkey
    FOREIGN KEY (rule_id) REFERENCES tickets.sla_rules(id) ON DELETE CASCADE;
ALTER TABLE tickets.tickets ADD CONSTRAINT fk_tickets_current_state
    FOREIGN KEY (current_state_id) REFERENCES tickets.states(id) ON DELETE RESTRICT;
ALTER TABLE tickets.tickets ADD CONSTRAINT fk_tickets_workflow_version
    FOREIGN KEY (workflow_version_id) REFERENCES tickets.workflow_versions(id) ON DELETE RESTRICT;
ALTER TABLE tickets.tickets ADD CONSTRAINT fk_tickets_sla_policy
    FOREIGN KEY (sla_policy_id) REFERENCES tickets.sla_policies(id) ON DELETE RESTRICT;
ALTER TABLE tickets.ticket_meetings ADD CONSTRAINT ticket_meetings_calendar_event_id_fkey
    FOREIGN KEY (calendar_event_id) REFERENCES calendar.events(id) ON DELETE SET NULL;
ALTER TABLE tickets.meeting_participants ADD CONSTRAINT meeting_participants_meeting_id_fkey
    FOREIGN KEY (meeting_id) REFERENCES tickets.ticket_meetings(id) ON DELETE CASCADE;

-- inventory
ALTER TABLE inventory.assets ADD CONSTRAINT assets_parent_asset_id_fkey
    FOREIGN KEY (parent_asset_id) REFERENCES inventory.assets(id) ON DELETE SET NULL;
ALTER TABLE inventory.asset_assignments ADD CONSTRAINT asset_assignments_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES inventory.assets(id) ON DELETE RESTRICT;
ALTER TABLE inventory.asset_assignment_history ADD CONSTRAINT asset_assignment_history_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES inventory.assets(id) ON DELETE RESTRICT;
ALTER TABLE inventory.asset_relationships ADD CONSTRAINT asset_relationships_parent_asset_id_fkey
    FOREIGN KEY (parent_asset_id) REFERENCES inventory.assets(id) ON DELETE CASCADE;
ALTER TABLE inventory.asset_relationships ADD CONSTRAINT asset_relationships_child_asset_id_fkey
    FOREIGN KEY (child_asset_id) REFERENCES inventory.assets(id) ON DELETE CASCADE;
ALTER TABLE inventory.ticket_assets ADD CONSTRAINT ticket_assets_asset_id_fkey
    FOREIGN KEY (asset_id) REFERENCES inventory.assets(id) ON DELETE RESTRICT;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 8: Triggers
-- ─────────────────────────────────────────────────────────────────────────────

-- auth
CREATE TRIGGER trg_audit_auth_credentials
  AFTER INSERT OR DELETE OR UPDATE ON auth.credentials
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_auth_credentials_updated_at
  BEFORE UPDATE ON auth.credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_auth_rt_updated_at
  BEFORE UPDATE ON auth.refresh_tokens
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_auth_sessions_updated_at
  BEFORE UPDATE ON auth.sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_auth_trl_updated_at
  BEFORE UPDATE ON auth.token_revocation_list
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- calendar
CREATE TRIGGER trg_calendar_events_updated_at
  BEFORE UPDATE ON calendar.events
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- config
CREATE TRIGGER trg_config_flags_updated_at
  BEFORE UPDATE ON config.feature_flags
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_config_settings_updated_at
  BEFORE UPDATE ON config.module_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_config_sla_rules_updated_at
  BEFORE UPDATE ON config.sla_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_config_priority_rules_updated_at
  BEFORE UPDATE ON config.priority_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_config_request_type_config_updated_at
  BEFORE UPDATE ON config.request_type_config
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- events
CREATE TRIGGER trg_events_outbox_updated_at
  BEFORE UPDATE ON events.outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- files
CREATE TRIGGER trg_files_updated_at
  BEFORE UPDATE ON files.files
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- inventory
CREATE TRIGGER trg_asset_assignments_updated_at
  BEFORE UPDATE ON inventory.asset_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_procurement_updated_at
  BEFORE UPDATE ON inventory.asset_procurement_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_asset_relationships_updated_at
  BEFORE UPDATE ON inventory.asset_relationships
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_asset_requests_updated_at
  BEFORE UPDATE ON inventory.asset_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_asset_version_bump
  BEFORE UPDATE ON inventory.assets
  FOR EACH ROW EXECUTE FUNCTION inventory.fn_asset_version_bump();

CREATE TRIGGER trg_assets_generate_qr
  BEFORE INSERT ON inventory.assets
  FOR EACH ROW EXECUTE FUNCTION inventory.fn_assets_generate_qr();

CREATE TRIGGER trg_assets_updated_at
  BEFORE UPDATE ON inventory.assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_inventory_assets
  AFTER INSERT OR DELETE OR UPDATE ON inventory.assets
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_inv_ticket_assets_updated_at
  BEFORE UPDATE ON inventory.ticket_assets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- modules (note: triggers for dropped tables modules.permissions and modules.role_permissions omitted)
CREATE TRIGGER trg_modules_categories_updated_at
  BEFORE UPDATE ON modules.categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_modules_environments_updated_at
  BEFORE UPDATE ON modules.environments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_modules_locations_updated_at
  BEFORE UPDATE ON modules.locations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_module_roles
  AFTER INSERT OR DELETE OR UPDATE ON modules.module_roles
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_modules_roles_updated_at
  BEFORE UPDATE ON modules.module_roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_modules
  AFTER INSERT OR DELETE OR UPDATE ON modules.modules
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_modules_updated_at
  BEFORE UPDATE ON modules.modules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_assign_log_updated_at
  BEFORE UPDATE ON modules.technician_assignment_log
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_status_updated_at
  BEFORE UPDATE ON modules.technician_status
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_user_module_roles
  AFTER INSERT OR DELETE OR UPDATE ON modules.user_module_roles
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_umr_updated_at
  BEFORE UPDATE ON modules.user_module_roles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_umr_validate_assigned_by
  BEFORE INSERT OR UPDATE OF assigned_by ON modules.user_module_roles
  FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('assigned_by');

CREATE TRIGGER trg_umr_validate_user_exists
  BEFORE INSERT OR UPDATE OF user_id ON modules.user_module_roles
  FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('user_id');

-- notifications
CREATE TRIGGER trg_notif_logs_updated_at
  BEFORE UPDATE ON notifications.notification_logs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_notif_templates_updated_at
  BEFORE UPDATE ON notifications.notification_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- org
CREATE TRIGGER trg_org_departments_updated_at
  BEFORE UPDATE ON org.departments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_org_areas_updated_at
  BEFORE UPDATE ON org.areas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_org_positions_updated_at
  BEFORE UPDATE ON org.positions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- tickets
CREATE TRIGGER trg_assignment_policies_updated_at
  BEFORE UPDATE ON tickets.assignment_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_assignment_policies
  AFTER INSERT OR DELETE OR UPDATE ON tickets.assignment_policies
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_sla_conditions_updated_at
  BEFORE UPDATE ON tickets.sla_conditions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_sla_policies
  AFTER INSERT OR DELETE OR UPDATE ON tickets.sla_policies
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_sla_policies_updated_at
  BEFORE UPDATE ON tickets.sla_policies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_sla_rules
  AFTER INSERT OR DELETE OR UPDATE ON tickets.sla_rules
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_sla_rules_updated_at
  BEFORE UPDATE ON tickets.sla_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_states_updated_at
  BEFORE UPDATE ON tickets.states
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_availability_updated_at
  BEFORE UPDATE ON tickets.technician_availability
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_skills_updated_at
  BEFORE UPDATE ON tickets.technician_category_skills
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_leaves_updated_at
  BEFORE UPDATE ON tickets.technician_leaves
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tech_profiles_updated_at
  BEFORE UPDATE ON tickets.technician_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ticket_approvals_updated_at
  BEFORE UPDATE ON tickets.ticket_approvals
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_tac_updated_at
  BEFORE UPDATE ON tickets.ticket_assignment_counters
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_ticket_assignments
  AFTER INSERT OR DELETE OR UPDATE ON tickets.ticket_assignments
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_ta_updated_at
  BEFORE UPDATE ON tickets.ticket_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ta_validate_assigned_by
  BEFORE INSERT OR UPDATE OF assigned_by ON tickets.ticket_assignments
  FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('assigned_by');

CREATE TRIGGER trg_ta_validate_user_exists
  BEFORE INSERT OR UPDATE OF user_id ON tickets.ticket_assignments
  FOR EACH ROW EXECUTE FUNCTION app.validate_user_exists('user_id');

CREATE TRIGGER trg_ticket_comments_updated_at
  BEFORE UPDATE ON tickets.ticket_comments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ticket_meetings_updated_at
  BEFORE UPDATE ON tickets.ticket_meetings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_sla_tracking_updated_at
  BEFORE UPDATE ON tickets.ticket_sla_tracking
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ticket_coherence
  BEFORE INSERT ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION tickets.fn_validate_ticket_coherence();

CREATE TRIGGER trg_ticket_state_audit
  AFTER UPDATE OF current_state_id ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_audit();

CREATE TRIGGER trg_ticket_state_history
  AFTER UPDATE OF current_state_id ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_state_history();

CREATE TRIGGER trg_ticket_updated_at
  BEFORE UPDATE ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ticket_version_bump
  BEFORE UPDATE ON tickets.tickets
  FOR EACH ROW EXECUTE FUNCTION tickets.fn_ticket_version_bump();

CREATE TRIGGER trg_transition_rules_updated_at
  BEFORE UPDATE ON tickets.transition_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_transitions_updated_at
  BEFORE UPDATE ON tickets.transitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_wfv_updated_at
  BEFORE UPDATE ON tickets.workflow_versions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- users
CREATE TRIGGER trg_users_orgs_updated_at
  BEFORE UPDATE ON users.organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_users_prefs_updated_at
  BEFORE UPDATE ON users.preferences
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_audit_users_profiles
  AFTER INSERT OR DELETE OR UPDATE ON users.profiles
  FOR EACH ROW EXECUTE FUNCTION audit.log_entity_changes();

CREATE TRIGGER trg_users_profiles_updated_at
  BEFORE UPDATE ON users.profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Protección módulos built-in — impide hard-delete y soft-delete
CREATE OR REPLACE FUNCTION modules.protect_builtin_module_delete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.is_builtin = true THEN
        RAISE EXCEPTION 'El módulo "%" es built-in y no puede eliminarse permanentemente.', OLD.name
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN OLD;
END; $$;

CREATE OR REPLACE FUNCTION modules.protect_builtin_module_softdelete()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.is_builtin = true AND NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
        RAISE EXCEPTION 'El módulo "%" es built-in y no puede enviarse a papelera.', OLD.name
            USING ERRCODE = 'restrict_violation';
    END IF;
    RETURN NEW;
END; $$;

CREATE TRIGGER trg_protect_builtin_delete
    BEFORE DELETE ON modules.modules
    FOR EACH ROW EXECUTE FUNCTION modules.protect_builtin_module_delete();

CREATE TRIGGER trg_protect_builtin_softdelete
    BEFORE UPDATE OF deleted_at ON modules.modules
    FOR EACH ROW EXECUTE FUNCTION modules.protect_builtin_module_softdelete();

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 9: Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tickets.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY policy_modules_delete ON modules.modules AS PERMISSIVE FOR DELETE TO public
  USING (app.is_superadmin() OR app.get_current_role() = 'admin');

CREATE POLICY policy_modules_insert ON modules.modules AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (app.is_superadmin() OR app.get_current_role() = 'admin');

CREATE POLICY policy_modules_select ON modules.modules AS PERMISSIVE FOR SELECT TO public
  USING (
    deleted_at IS NULL AND (
      app.is_superadmin() OR
      app.get_current_role() = 'admin' OR
      EXISTS (
        SELECT 1 FROM modules.user_module_roles umr
        WHERE umr.module_id = modules.id AND umr.user_id = app.get_current_user_id() AND umr.is_active = true
      )
    )
  );

CREATE POLICY policy_modules_update ON modules.modules AS PERMISSIVE FOR UPDATE TO public
  USING (app.is_superadmin() OR app.get_current_role() = 'admin' OR app.has_module_permission('module.config', id))
  WITH CHECK (true);

CREATE POLICY policy_tickets_insert ON tickets.tickets AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (
    created_by = app.get_current_user_id() AND
    app.has_module_permission('tickets.create', module_id)
  );

CREATE POLICY policy_tickets_select ON tickets.tickets AS PERMISSIVE FOR SELECT TO public
  USING (
    app.is_superadmin() OR
    app.get_current_role() = 'admin' OR
    created_by = app.get_current_user_id() OR
    EXISTS (
      SELECT 1 FROM tickets.ticket_assignments ta
      WHERE ta.ticket_id = tickets.id AND ta.user_id = app.get_current_user_id() AND ta.is_active = true
    ) OR
    app.has_module_permission('tickets.view_all', module_id)
  );

CREATE POLICY policy_tickets_update ON tickets.tickets AS PERMISSIVE FOR UPDATE TO public
  USING (
    app.is_superadmin() OR
    app.get_current_role() = 'admin' OR
    created_by = app.get_current_user_id() OR
    EXISTS (
      SELECT 1 FROM tickets.ticket_assignments ta
      WHERE ta.ticket_id = tickets.id AND ta.user_id = app.get_current_user_id() AND ta.is_active = true
    ) OR
    app.has_module_permission('tickets.transition', module_id)
  )
  WITH CHECK (true);

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 10: Particiones
-- ─────────────────────────────────────────────────────────────────────────────

-- HASH × 8 para ticket_assignments
DO $$
BEGIN
  FOR i IN 0..7 LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS tickets.ticket_assignments_%s
       PARTITION OF tickets.ticket_assignments
       FOR VALUES WITH (MODULUS 8, REMAINDER %s)',
      i, i);
  END LOOP;
END $$;

-- RANGE mensual 2026-01 → 2027-12 para 5 tablas particionadas
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
        'CREATE TABLE IF NOT EXISTS audit.event_log_%s
         PARTITION OF audit.event_log FOR VALUES FROM (%L) TO (%L)',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS notifications.notification_logs_%s
         PARTITION OF notifications.notification_logs FOR VALUES FROM (%L) TO (%L)',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS tickets.ticket_comments_%s
         PARTITION OF tickets.ticket_comments FOR VALUES FROM (%L) TO (%L)',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS tickets.ticket_state_history_%s
         PARTITION OF tickets.ticket_state_history FOR VALUES FROM (%L) TO (%L)',
        suf, ts, te);
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS tickets.tickets_%s
         PARTITION OF tickets.tickets FOR VALUES FROM (%L) TO (%L)',
        suf, ts, te);
    END LOOP;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 11: Vistas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW modules.v_available_technicians AS
WITH tech_load AS (
  SELECT ta.user_id, t.module_id, count(*)::integer AS active_tickets
  FROM tickets.ticket_assignments ta
  JOIN tickets.tickets t ON t.id = ta.ticket_id
  WHERE ta.is_active = true
  GROUP BY ta.user_id, t.module_id
),
last_assign AS (
  SELECT user_id, module_id, max(assigned_at) AS last_assigned_at
  FROM modules.technician_assignment_log
  GROUP BY user_id, module_id
)
SELECT
  umr.user_id,
  umr.module_id,
  mr.name AS role_name,
  (p.first_name::text || ' ' || p.last_name::text) AS full_name,
  COALESCE(ts.is_available, true) AS is_available,
  ts.reason AS unavailable_reason,
  ts.unavailable_to,
  COALESCE(tl.active_tickets, 0) AS active_tickets,
  la.last_assigned_at,
  row_number() OVER (
    PARTITION BY umr.module_id
    ORDER BY COALESCE(tl.active_tickets, 0), la.last_assigned_at NULLS FIRST
  ) AS round_robin_position
FROM modules.user_module_roles umr
JOIN modules.module_roles mr ON mr.id = umr.role_id
JOIN users.profiles p ON p.id = umr.user_id
LEFT JOIN modules.technician_status ts
  ON ts.user_id = umr.user_id AND ts.module_id = umr.module_id
LEFT JOIN tech_load tl
  ON tl.user_id = umr.user_id AND tl.module_id = umr.module_id
LEFT JOIN last_assign la
  ON la.user_id = umr.user_id AND la.module_id = umr.module_id
WHERE umr.is_active = true
  AND p.is_active = true
  AND p.deleted_at IS NULL
  AND mr.name = ANY(ARRAY['tecnico'::varchar, 'jefe_tecnico'::varchar, 'admin_modulo'::varchar])
  AND (
    ts.id IS NULL OR
    ts.is_available = true OR
    (ts.is_available = false AND ts.unavailable_to IS NOT NULL AND ts.unavailable_to < now())
  );

CREATE OR REPLACE VIEW tickets.v_tickets_unified AS
SELECT
  t.id,
  t.module_id,
  m.name AS module_name,
  m.slug AS module_slug,
  t.environment_id,
  t.category_id,
  cat.name AS category_name,
  t.created_by,
  (p_creator.first_name::text || ' ' || p_creator.last_name::text) AS created_by_name,
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
  (p_tech.first_name::text || ' ' || p_tech.last_name::text) AS assigned_to_name,
  sla_track.status AS sla_status,
  sla_track.deadline_at AS sla_deadline_at,
  sla_track.breached_at AS sla_breached_at,
  CASE
    WHEN sla_track.deadline_at IS NOT NULL AND sla_track.breached_at IS NULL
    THEN EXTRACT(epoch FROM (sla_track.deadline_at - now())) / 3600.0
    ELSE NULL
  END AS sla_remaining_hours,
  appr.status AS approval_status,
  appr.expires_at AS approval_expires_at,
  CASE date(t.created_at)
    WHEN CURRENT_DATE THEN 'today'
    ELSE 'previous'
  END AS queue_group
FROM tickets.tickets t
LEFT JOIN modules.modules m ON m.id = t.module_id
LEFT JOIN modules.categories cat ON cat.id = t.category_id
LEFT JOIN tickets.states st ON st.id = t.current_state_id
LEFT JOIN users.profiles p_creator ON p_creator.id = t.created_by
LEFT JOIN tickets.ticket_assignments ta_owner
  ON ta_owner.ticket_id = t.id AND ta_owner.role = 'owner'::assignment_role AND ta_owner.is_active = true
LEFT JOIN users.profiles p_tech ON p_tech.id = ta_owner.user_id
LEFT JOIN tickets.ticket_sla_tracking sla_track ON sla_track.ticket_id = t.id
LEFT JOIN tickets.ticket_approvals appr
  ON appr.ticket_id = t.id AND appr.status = 'pending'::approval_status;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 12: Vistas materializadas
-- ─────────────────────────────────────────────────────────────────────────────
CREATE MATERIALIZED VIEW IF NOT EXISTS reports.technician_load AS
SELECT
  ta.user_id,
  t.module_id,
  (p.first_name::text || ' ' || p.last_name::text) AS full_name,
  count(*) AS active_tickets,
  count(*) FILTER (WHERE t.priority = 'critica'::priority_level) AS critical_count,
  count(*) FILTER (WHERE t.priority = 'alta'::priority_level) AS high_count,
  now() AS refreshed_at
FROM tickets.ticket_assignments ta
JOIN tickets.tickets t ON t.id = ta.ticket_id
JOIN users.profiles p ON p.id = ta.user_id
JOIN tickets.states st ON st.id = t.current_state_id AND st.is_final = false
WHERE ta.is_active = true AND ta.role = 'owner'::assignment_role
GROUP BY ta.user_id, t.module_id, p.first_name, p.last_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- PARTE 13: Seeds base
-- Orden: org → roles → perfil sistema → flags → settings →
--        sla_rules → priority_rules → request_type_config →
--        bootstrap módulos → permission_definitions → RBAC grants
-- ─────────────────────────────────────────────────────────────────────────────

-- Organización single-tenant
INSERT INTO users.organizations (id, name, slug) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Mi Empresa', 'default')
ON CONFLICT DO NOTHING;

-- Roles globales: 2 roles (superadmin y usuario)
-- admin_modulo es rol de módulo, no global
INSERT INTO config.global_roles (id, name, description, is_active) VALUES
  ('00000000-0000-0000-0001-000000000001', 'superadmin', 'Administrador global de la plataforma', true),
  ('00000000-0000-0000-0001-000000000002', 'usuario',    'Usuario estándar del sistema',          true)
ON CONFLICT (name) DO UPDATE SET is_active = TRUE, description = EXCLUDED.description;

-- Perfil sistema (actor para operaciones automáticas)
INSERT INTO users.profiles (id, first_name, last_name, is_superadmin, is_active, profile_complete, global_role_id)
VALUES ('00000000-0000-0000-0000-000000000001', 'Admin', 'Sistema', true, true, true,
  '00000000-0000-0000-0001-000000000001')
ON CONFLICT DO NOTHING;

-- Feature flags base
INSERT INTO config.feature_flags (module_id, flag_key, is_enabled, description) VALUES
  (NULL, 'google_oauth_enabled',   false, 'Habilita login con Google OAuth'),
  (NULL, 'video_calls_enabled',    false, 'Habilita videollamadas en tickets'),
  (NULL, 'ticket_ratings_enabled', true,  'Habilita calificación de servicio al cerrar ticket')
ON CONFLICT DO NOTHING;

-- Module settings globales
INSERT INTO config.module_settings (module_id, key, value, value_type, description, is_active) VALUES
  (NULL, 'company_info',
    '{"name":"Mi Empresa","language":"es","timezone":"America/Bogota","support_email":"soporte@miempresa.com"}',
    'json', 'Información de la empresa', true),
  (NULL, 'auth_config',
    '{"allow_local_auth":true,"session_duration_hours":8,"require_email_verification":false}',
    'json', 'Configuración de autenticación', true),
  (NULL, 'notification_defaults',
    '{"channels":["in_app","email"],"email_from":"noreply@miempresa.com","whatsapp_enabled":false}',
    'json', 'Configuración de notificaciones', true),
  (NULL, 'rating_ttl_days',    '7',     'string', 'Días disponibles para calificar ticket cerrado', true),
  (NULL, 'trash_warning_days', '7,3,1', 'string', 'Días antes del hard-delete para aviso (CSV)',   true)
ON CONFLICT (module_id, key, version) DO NOTHING;

-- SLA por defecto (gestión administrativa)
INSERT INTO config.sla_rules (request_type, priority, hours_to_resolve, hours_to_first_response)
VALUES
  (NULL,               'critica', 2,  1),
  (NULL,               'alta',    8,  2),
  (NULL,               'media',   24, 4),
  (NULL,               'baja',    72, 8),
  ('reactivation',     'media',   4,  1),
  ('account_issue',    'media',   4,  1),
  ('access_revocation','alta',    4,  1),
  ('technical_issue',  'alta',    6,  1)
ON CONFLICT (request_type, priority) DO NOTHING;

-- Reglas de prioridad por defecto
INSERT INTO config.priority_rules (request_type, base_priority, position_level_min, elevated_priority, notes)
VALUES
  ('role_change',           'media', 4,    'alta',  'Directores+ obtienen alta prioridad'),
  ('module_access',         'media', 3,    'alta',  'Coordinadores+ obtienen alta prioridad'),
  ('permission_adjustment', 'media', 3,    'alta',  'Coordinadores+ obtienen alta prioridad'),
  ('account_issue',         'alta',  NULL, NULL,    'Siempre alta — bloquea acceso del usuario'),
  ('reactivation',          'alta',  NULL, NULL,    'Siempre alta — usuario bloqueado'),
  ('access_revocation',     'alta',  NULL, NULL,    'Siempre alta — seguridad'),
  ('user_transfer',         'media', 4,    'alta',  'Directores+ obtienen alta prioridad'),
  ('technical_issue',       'media', 3,    'alta',  'Coordinadores+ obtienen alta prioridad'),
  ('data_correction',       'baja',  4,    'media', 'Directores+ obtienen media prioridad'),
  ('other',                 'media', NULL, NULL,    'Tipo general — prioridad manual permitida'),
  ('task',                  'media', NULL, NULL,    'Tareas internas')
ON CONFLICT (request_type) DO NOTHING;

-- Tipos de solicitud configurables
INSERT INTO config.request_type_config
  (type_key, label, description, is_active, requires_module, allows_manual_priority, sort_order)
VALUES
  ('role_change',           'Cambio de rol',         'Cambiar el rol de un usuario dentro de un módulo',           true,  true,  false, 1),
  ('module_access',         'Acceso a módulo',       'Solicitar acceso a un módulo del sistema',                   true,  true,  false, 2),
  ('permission_adjustment', 'Ajuste de permisos',    'Modificar permisos específicos dentro de un módulo',         true,  true,  false, 3),
  ('account_issue',         'Problema de cuenta',    'Bloqueos, acceso o problemas con la cuenta de usuario',      true,  false, false, 4),
  ('reactivation',          'Reactivación',          'Reactivar cuenta o acceso de usuario inactivo',              true,  false, false, 5),
  ('access_revocation',     'Revocación de acceso',  'Revocar acceso de un usuario a módulo o sistema',            true,  true,  false, 6),
  ('user_transfer',         'Traslado de usuario',   'Transferir usuario entre módulos, sedes o departamentos',    true,  false, false, 7),
  ('technical_issue',       'Problema técnico',      'Problema técnico con un módulo o funcionalidad',             true,  true,  false, 8),
  ('data_correction',       'Corrección de datos',   'Corrección de datos empresariales o registros incorrectos',  true,  false, false, 9),
  ('other',                 'Otro',                  'Solicitud general o no categorizada — prioridad configurable', true, false, true,  10),
  ('task',                  'Tarea interna',         'Tarea asignada internamente por administrador',              true,  false, false, 11)
ON CONFLICT (type_key) DO NOTHING;

-- Bootstrap módulos built-in (3 módulos del sistema)
-- Helpdesk — soporte técnico / tickets
SELECT modules.bootstrap_module(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Helpdesk', 'helpdesk',
  'Sistema principal de tickets y soporte técnico',
  true,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'helpdesk',
  'helpdesk',
  true   -- is_builtin
);

-- Inventario — gestión de activos
SELECT modules.bootstrap_module(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Inventario', 'inventario',
  'Gestión de activos e inventario corporativo',
  true,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'inventario',
  'inventario',
  true   -- is_builtin
);

-- Gestión Administrativa — hub de solicitudes internas (módulo built-in)
SELECT modules.bootstrap_module(
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Gestión Administrativa', 'gestion-administrativa',
  'Hub central de solicitudes y gestión administrativa interna',
  true,
  '00000000-0000-0000-0000-000000000001'::uuid,
  'gestion',
  'gestion',
  true   -- is_builtin
);

-- ── permission_definitions — 60 permisos (idempotente) ───────────────────────
SET CONSTRAINTS ALL DEFERRED;

-- raíz global
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('global:system:access', 'Acceso al sistema', 'Permiso base para entrar al sistema', 'global', 'system', 'access', NULL, 0)
ON CONFLICT (key) DO NOTHING;

-- sidebar global
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('global:sidebar:view', 'Ver barra de navegación', 'Puede ver el menú lateral', 'global', 'sidebar', 'view', 'global:system:access', 10)
ON CONFLICT (key) DO NOTHING;

-- secciones del sidebar
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('global:sidebar:dashboard', 'Ver sección Dashboard',        'Dashboard visible en sidebar',             'global', 'dashboard', 'sidebar',      'global:sidebar:view',  20),
  ('global:sidebar:users',     'Ver sección Usuarios',         'Usuarios visible en sidebar',              'global', 'users',     'sidebar',      'global:sidebar:view',  30),
  ('global:sidebar:roles',     'Ver sección Roles',            'Roles visible en sidebar',                 'global', 'roles',     'sidebar',      'global:sidebar:view',  40),
  ('global:sidebar:reports',   'Ver sección Reportes',         'Reportes visible en sidebar',              'global', 'reports',   'sidebar',      'global:sidebar:view',  50),
  ('global:sidebar:trash',     'Ver sección Papelera',         'Papelera visible en sidebar',              'global', 'trash',     'sidebar',      'global:sidebar:view',  60),
  ('global:sidebar:config',    'Ver sección Configuración',    'Config maestra visible en sidebar',        'global', 'config',    'sidebar',      'global:sidebar:view',  70)
ON CONFLICT (key) DO NOTHING;

-- raíces de sección global
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('global:dashboard:view',  'Ver dashboard',               'Puede abrir y ver el dashboard',            'global', 'dashboard', 'view',         'global:sidebar:dashboard', 100),
  ('global:users:view',      'Ver lista de usuarios',       'Puede ver la lista de usuarios del sistema','global', 'users',     'view',         'global:sidebar:users',     110),
  ('global:roles:view',      'Ver roles globales',          'Puede ver la lista de roles',               'global', 'roles',     'view',         'global:sidebar:roles',     120),
  ('global:reports:view',    'Ver reportes globales',       'Puede ver reportes del sistema',            'global', 'reports',   'view',         'global:sidebar:reports',   130),
  ('global:trash:view',      'Ver papelera',                'Puede ver elementos en papelera',           'global', 'trash',     'view',         'global:sidebar:trash',     140),
  ('global:config:view',     'Ver configuración maestra',   'Puede ver la página de configuración',      'global', 'config',    'view',         'global:sidebar:config',    150)
ON CONFLICT (key) DO NOTHING;

-- acciones globales
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('global:dashboard:modules_view', 'Ver módulos en dashboard',      'Puede ver las tarjetas de módulos',         'global', 'dashboard', 'modules_view', 'global:dashboard:view',   200),
  ('global:users:create',           'Crear usuarios',                'Puede crear nuevos usuarios',               'global', 'users',     'create',       'global:users:view',        210),
  ('global:users:edit',             'Editar usuarios',               'Puede editar información de usuarios',      'global', 'users',     'edit',         'global:users:view',        220),
  ('global:users:delete',           'Eliminar usuarios',             'Puede eliminar usuarios (soft-delete)',     'global', 'users',     'delete',       'global:users:view',        230),
  ('global:users:assign_role',      'Asignar roles globales',        'Puede cambiar el rol global de un usuario', 'global', 'users',    'assign_role',  'global:users:view',        240),
  ('global:roles:create',           'Crear roles',                   'Puede crear nuevos roles globales',         'global', 'roles',     'create',       'global:roles:view',        250),
  ('global:roles:edit',             'Editar roles',                  'Puede editar roles existentes',             'global', 'roles',     'edit',         'global:roles:view',        260),
  ('global:roles:delete',           'Eliminar roles',                'Puede eliminar roles',                      'global', 'roles',     'delete',       'global:roles:view',        270),
  ('global:roles:assign_perms',     'Gestionar permisos de roles',   'Puede asignar/quitar permisos a roles',     'global', 'roles',     'assign_perms', 'global:roles:view',        280),
  ('global:trash:restore',          'Restaurar desde papelera',      'Puede restaurar elementos eliminados',      'global', 'trash',     'restore',      'global:trash:view',        290),
  ('global:trash:purge',            'Eliminar definitivamente',      'Puede borrar de forma permanente',          'global', 'trash',     'purge',        'global:trash:view',        300),
  ('global:config:company',         'Editar datos de empresa',       'Puede editar nombre, logo, colores, etc.',  'global', 'config',    'company',      'global:config:view',       310),
  ('global:config:org',             'Gestionar organización',        'Puede gestionar sedes, departamentos, cargos','global','config',   'org',          'global:config:view',       320),
  ('global:config:sla',             'Gestionar reglas SLA',          'Puede editar los tiempos de resolución',    'global', 'config',    'sla',          'global:config:view',       330),
  ('global:config:request_types',   'Gestionar tipos de solicitud',  'Puede activar/editar tipos de solicitud',   'global', 'config',    'request_types','global:config:view',       340),
  ('global:config:bulk_import',     'Importar usuarios masivamente', 'Puede hacer importación masiva de usuarios','global', 'config',    'bulk_import',  'global:config:view',       350),
  ('global:config:roles_perms',     'Gestionar roles y permisos',    'Puede configurar permisos del sistema',     'global', 'config',    'roles_perms',  'global:config:view',       360)
ON CONFLICT (key) DO NOTHING;

-- gestión administrativa — raíces
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('gestion:requests:view_own',  'Ver solicitudes propias',    'Puede ver sus propias solicitudes',              'gestion', 'requests', 'view_own', NULL, 400),
  ('gestion:requests:view_all',  'Ver todas las solicitudes',  'Ve todas las solicitudes (vista admin)',          'gestion', 'requests', 'view_all', NULL, 410),
  ('gestion:roles:view',         'Ver roles del módulo',       'Puede ver los roles del módulo',                 'gestion', 'roles',    'view',     NULL, 420),
  ('gestion:users:view',         'Ver usuarios del módulo',    'Puede ver usuarios asignados al módulo',         'gestion', 'users',    'view',     NULL, 430),
  ('gestion:reports:view',       'Ver reportes del módulo',    'Puede ver reportes de gestión',                  'gestion', 'reports',  'view',     NULL, 440),
  ('gestion:trash:view',         'Ver papelera del módulo',    'Puede ver la papelera del módulo',               'gestion', 'trash',    'view',     NULL, 450)
ON CONFLICT (key) DO NOTHING;

-- gestión administrativa — acciones
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('gestion:requests:create',   'Crear solicitudes',         'Puede crear nuevas solicitudes',                   'gestion', 'requests', 'create',      'gestion:requests:view_own', 500),
  ('gestion:requests:take',     'Tomar solicitudes',         'Puede asignarse solicitudes',                      'gestion', 'requests', 'take',        'gestion:requests:view_all', 510),
  ('gestion:requests:progress', 'Actualizar progreso',       'Puede actualizar el estado de progreso',           'gestion', 'requests', 'progress',    'gestion:requests:view_all', 520),
  ('gestion:requests:approve',  'Aprobar solicitudes',       'Puede aprobar solicitudes',                        'gestion', 'requests', 'approve',     'gestion:requests:view_all', 530),
  ('gestion:requests:reject',   'Rechazar solicitudes',      'Puede rechazar solicitudes',                       'gestion', 'requests', 'reject',      'gestion:requests:view_all', 540),
  ('gestion:requests:escalate', 'Escalar solicitudes',       'Puede escalar solicitudes a nivel superior',       'gestion', 'requests', 'escalate',    'gestion:requests:view_all', 550),
  ('gestion:roles:create',      'Crear roles de módulo',     'Puede crear roles dentro del módulo',              'gestion', 'roles',    'create',      'gestion:roles:view',        560),
  ('gestion:roles:edit',        'Editar roles de módulo',    'Puede editar roles del módulo',                    'gestion', 'roles',    'edit',        'gestion:roles:view',        570),
  ('gestion:roles:delete',      'Eliminar roles de módulo',  'Puede eliminar roles del módulo',                  'gestion', 'roles',    'delete',      'gestion:roles:view',        580),
  ('gestion:users:assign_role', 'Asignar rol de módulo',     'Puede asignar rol de módulo a usuarios',           'gestion', 'users',    'assign_role', 'gestion:users:view',        590),
  ('gestion:trash:restore',     'Restaurar de papelera',     'Puede restaurar elementos del módulo',             'gestion', 'trash',    'restore',     'gestion:trash:view',        600)
ON CONFLICT (key) DO NOTHING;

-- helpdesk — raíz
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('helpdesk:tickets:view', 'Ver tickets', 'Puede ver los tickets de soporte', 'helpdesk', 'tickets', 'view', NULL, 700)
ON CONFLICT (key) DO NOTHING;

-- helpdesk — acciones
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('helpdesk:tickets:create',  'Crear tickets',        'Puede crear nuevos tickets',         'helpdesk', 'tickets',  'create', 'helpdesk:tickets:view',  710),
  ('helpdesk:tickets:edit',    'Editar tickets',       'Puede editar tickets existentes',     'helpdesk', 'tickets',  'edit',   'helpdesk:tickets:view',  720),
  ('helpdesk:tickets:close',   'Cerrar tickets',       'Puede cerrar tickets',               'helpdesk', 'tickets',  'close',  'helpdesk:tickets:view',  730),
  ('helpdesk:tickets:delete',  'Eliminar tickets',     'Puede eliminar tickets',             'helpdesk', 'tickets',  'delete', 'helpdesk:tickets:view',  740),
  ('helpdesk:tickets:assign',  'Asignar tickets',      'Puede asignar tickets a agentes',    'helpdesk', 'tickets',  'assign', 'helpdesk:tickets:view',  750),
  ('helpdesk:comments:add',    'Agregar comentarios',  'Puede comentar en tickets',          'helpdesk', 'comments', 'add',    'helpdesk:tickets:view',  760),
  ('helpdesk:comments:delete', 'Eliminar comentarios', 'Puede eliminar comentarios',         'helpdesk', 'comments', 'delete', 'helpdesk:comments:add',  770)
ON CONFLICT (key) DO NOTHING;

-- inventario — raíz
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('inventario:items:view', 'Ver inventario', 'Puede ver los ítems del inventario', 'inventario', 'items', 'view', NULL, 800)
ON CONFLICT (key) DO NOTHING;

-- inventario — acciones
INSERT INTO config.permission_definitions (key, label, description, scope, section, action, parent_key, sort_order) VALUES
  ('inventario:items:create', 'Crear ítems',    'Puede agregar ítems al inventario',    'inventario', 'items', 'create', 'inventario:items:view', 810),
  ('inventario:items:edit',   'Editar ítems',   'Puede editar ítems existentes',        'inventario', 'items', 'edit',   'inventario:items:view', 820),
  ('inventario:items:delete', 'Eliminar ítems', 'Puede eliminar ítems del inventario',  'inventario', 'items', 'delete', 'inventario:items:view', 830)
ON CONFLICT (key) DO NOTHING;

-- ── RBAC grants — superadmin: todos los permisos ─────────────────────────────
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM config.global_roles gr
CROSS JOIN config.permission_definitions pd
WHERE gr.name = 'superadmin' AND pd.is_active = true
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ── RBAC grants — usuario: acceso básico ─────────────────────────────────────
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT gr.id, 'global', pd.key
FROM config.global_roles gr
CROSS JOIN config.permission_definitions pd
WHERE gr.name = 'usuario'
  AND pd.key IN (
    'global:system:access',      'global:sidebar:view',
    'global:sidebar:dashboard',  'global:dashboard:view',   'global:dashboard:modules_view',
    'gestion:requests:view_own', 'gestion:requests:create',
    'helpdesk:tickets:view',     'helpdesk:tickets:create', 'helpdesk:comments:add',
    'inventario:items:view'
  )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ── Module role grants — seeded por scope tras bootstrap ─────────────────────

-- gestion admin roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM modules.module_roles mr
JOIN modules.modules m ON m.id = mr.module_id
CROSS JOIN config.permission_definitions pd
WHERE mr.is_admin = true AND mr.is_active = true
  AND m.permission_scope = 'gestion' AND m.deleted_at IS NULL
  AND pd.key IN (
    'gestion:requests:view_own',  'gestion:requests:view_all', 'gestion:requests:create',
    'gestion:requests:take',      'gestion:requests:progress', 'gestion:requests:approve',
    'gestion:requests:reject',    'gestion:requests:escalate',
    'gestion:roles:view',         'gestion:roles:create',      'gestion:roles:edit',
    'gestion:roles:delete',       'gestion:users:view',        'gestion:users:assign_role',
    'gestion:reports:view',       'gestion:trash:view',        'gestion:trash:restore'
  )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- gestion usuario roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM modules.module_roles mr
JOIN modules.modules m ON m.id = mr.module_id
CROSS JOIN config.permission_definitions pd
WHERE mr.is_admin = false AND mr.is_active = true
  AND m.permission_scope = 'gestion' AND m.deleted_at IS NULL
  AND pd.key IN ('gestion:requests:view_own', 'gestion:requests:create')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- helpdesk admin roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM modules.module_roles mr
JOIN modules.modules m ON m.id = mr.module_id
CROSS JOIN config.permission_definitions pd
WHERE mr.is_admin = true AND mr.is_active = true
  AND m.permission_scope = 'helpdesk' AND m.deleted_at IS NULL
  AND pd.key IN (
    'helpdesk:tickets:view',   'helpdesk:tickets:create',  'helpdesk:tickets:edit',
    'helpdesk:tickets:close',  'helpdesk:tickets:delete',  'helpdesk:tickets:assign',
    'helpdesk:comments:add',   'helpdesk:comments:delete'
  )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- helpdesk usuario roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM modules.module_roles mr
JOIN modules.modules m ON m.id = mr.module_id
CROSS JOIN config.permission_definitions pd
WHERE mr.is_admin = false AND mr.is_active = true
  AND m.permission_scope = 'helpdesk' AND m.deleted_at IS NULL
  AND pd.key IN ('helpdesk:tickets:view', 'helpdesk:tickets:create', 'helpdesk:comments:add')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- inventario admin roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM modules.module_roles mr
JOIN modules.modules m ON m.id = mr.module_id
CROSS JOIN config.permission_definitions pd
WHERE mr.is_admin = true AND mr.is_active = true
  AND m.permission_scope = 'inventario' AND m.deleted_at IS NULL
  AND pd.key IN (
    'inventario:items:view', 'inventario:items:create',
    'inventario:items:edit', 'inventario:items:delete'
  )
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- inventario usuario roles
INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
SELECT mr.id, 'module', pd.key
FROM modules.module_roles mr
JOIN modules.modules m ON m.id = mr.module_id
CROSS JOIN config.permission_definitions pd
WHERE mr.is_admin = false AND mr.is_active = true
  AND m.permission_scope = 'inventario' AND m.deleted_at IS NULL
  AND pd.key IN ('inventario:items:view')
ON CONFLICT (role_id, permission_key) DO NOTHING;

-- ============================================================================
-- FIN — SCHEMA_MASTER.sql
-- Para datos demo: psql -d <db> -f database/SEED_TEST.sql
-- Particiones futuras: SELECT maintenance.create_future_partitions(6);
-- Recargar MV: SELECT reports.refresh_all();
-- ============================================================================
