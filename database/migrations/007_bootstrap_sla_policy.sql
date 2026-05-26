-- Migration 007: Fix bootstrap_module + backfill SLA policies for existing modules
-- Apply: psql $DATABASE_URL -f migrations/007_bootstrap_sla_policy.sql
--
-- Problem: bootstrap_module creates workflow/roles/assignment_policy but NOT tickets.sla_policies.
-- Any ticket creation fails with "No active SLA policy for this module."
--
-- Fix:
--   1. Backfill sla_policies for all existing modules that lack one
--   2. Update bootstrap_module function to create the policy on module creation

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Backfill: create default SLA policy for every module that lacks one
-- ---------------------------------------------------------------------------
INSERT INTO tickets.sla_policies (module_id, name, version, is_active)
SELECT m.id, 'Default', 1, true
FROM   modules.modules m
WHERE  m.is_active = true
  AND  NOT EXISTS (
    SELECT 1 FROM tickets.sla_policies sp
    WHERE sp.module_id = m.id AND sp.is_active = true
  )
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Update bootstrap_module to always create/ensure the SLA policy
-- ---------------------------------------------------------------------------
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

    -- SLA policy (DEFAULT — rules can be added later via admin UI)
    INSERT INTO tickets.sla_policies (module_id, name, version, is_active)
    VALUES (v_module_id, 'Default', 1, true)
    ON CONFLICT DO NOTHING;

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

COMMIT;

-- VERIFY
-- SELECT m.name, sp.id AS policy_id, sp.is_active
-- FROM modules.modules m
-- LEFT JOIN tickets.sla_policies sp ON sp.module_id = m.id AND sp.is_active = true
-- ORDER BY m.name;
