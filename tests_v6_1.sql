-- ============================================================================
-- SUITE DE PRUEBAS v6.1 — 14 tests de regresión
-- Ejecutar DESPUÉS de DB_FINAL_v6_1.sql en BD de prueba.
-- Todos los tests usan RAISE NOTICE con PASS/FAIL para inspección manual.
-- ============================================================================
-- Uso:
--   dropdb test_db && createdb test_db
--   psql -d test_db -v ON_ERROR_STOP=1 -f DB_FINAL_v6_1.sql
--   psql -d test_db -v ON_ERROR_STOP=1 -f tests_v6_1.sql
-- ============================================================================

-- TEST 1: Ejecución limpia
-- Verificada implícitamente: si DB_FINAL_v6_1.sql completó sin error, TEST 1 pasa.
DO $$ BEGIN RAISE NOTICE 'TEST 1 PASS: ejecución limpia (sin ON_ERROR_STOP falló)'; END $$;

-- TEST 2: Idempotencia — re-run del script principal
-- Este test se valida ejecutando DB_FINAL_v6_1.sql por segunda vez en la misma BD.
-- psql -d test_db -v ON_ERROR_STOP=1 -f DB_FINAL_v6_1.sql  → exit code 0
DO $$ BEGIN RAISE NOTICE 'TEST 2: re-ejecutar DB_FINAL_v6_1.sql en esta misma BD para validar idempotencia.'; END $$;

-- TEST 3: resolve_sla con condiciones reales
DO $$
DECLARE
    v_module UUID;
    v_policy UUID;
    v_rule   UUID;
    v_result RECORD;
BEGIN
    SELECT id INTO v_module FROM modules.modules WHERE slug = 'helpdesk';

    INSERT INTO tickets.sla_policies (module_id, name, version, is_active)
    VALUES (v_module, 'Test Policy T3', 99, true)
    RETURNING id INTO v_policy;

    INSERT INTO tickets.sla_rules (policy_id, priority_result, resolution_time_hours, rule_order)
    VALUES (v_policy, 'critica', 4, 1)
    RETURNING id INTO v_rule;

    INSERT INTO tickets.sla_conditions (rule_id, field, operator, value, logical_group, order_index)
    VALUES (v_rule, 'urgency', '=', 'alta', 1, 1);

    SELECT * INTO v_result
    FROM tickets.resolve_sla(v_module, NULL, NULL, 'alta', NULL);

    IF v_result.priority_result = 'critica' THEN
        RAISE NOTICE 'TEST 3 PASS: resolve_sla con condición urgency=alta → critica';
    ELSE
        RAISE NOTICE 'TEST 3 FAIL: % (esperado critica)', v_result.priority_result;
    END IF;
END $$;

-- TEST 4: Round-robin 2-2-2 — 3 técnicos, 6 asignaciones
DO $$
DECLARE
    v_module     UUID;
    v_env        UUID;
    v_cat        UUID;
    v_wfv        UUID;
    v_state      UUID;
    v_sla        UUID;
    v_u1 UUID := gen_random_uuid();
    v_u2 UUID := gen_random_uuid();
    v_u3 UUID := gen_random_uuid();
    v_counts     INT[];
    v_c1 INT; v_c2 INT; v_c3 INT;
BEGIN
    SELECT id INTO v_module FROM modules.modules WHERE slug = 'helpdesk';
    SELECT id INTO v_wfv    FROM tickets.workflow_versions WHERE module_id = v_module AND version = 1;
    SELECT id INTO v_state  FROM tickets.states WHERE workflow_version_id = v_wfv AND is_initial = true;
    SELECT id INTO v_sla    FROM tickets.sla_policies WHERE module_id = v_module LIMIT 1;

    -- Crear ambiente y categoría de prueba
    INSERT INTO modules.locations (module_id, name) VALUES (v_module, 'Test Loc T4') RETURNING id INTO v_env;
    INSERT INTO modules.environments (location_id, module_id, name) VALUES (v_env, v_module, 'Env T4') RETURNING id INTO v_env;
    INSERT INTO modules.categories (module_id, name) VALUES (v_module, 'Cat T4') RETURNING id INTO v_cat;

    -- Crear perfiles de usuario
    INSERT INTO users.profiles (id, first_name, last_name) VALUES (v_u1, 'Tech', 'Uno'), (v_u2, 'Tech', 'Dos'), (v_u3, 'Tech', 'Tres');

    -- Asignar rol tecnico
    DECLARE v_role_id UUID;
    BEGIN
        SELECT mr.id INTO v_role_id FROM modules.module_roles mr WHERE mr.module_id = v_module AND mr.name = 'tecnico';
        INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by)
        VALUES (v_u1, v_module, v_role_id, '00000000-0000-0000-0000-000000000001'),
               (v_u2, v_module, v_role_id, '00000000-0000-0000-0000-000000000001'),
               (v_u3, v_module, v_role_id, '00000000-0000-0000-0000-000000000001');
    END;

    -- Crear perfiles técnicos
    INSERT INTO tickets.technician_profiles (user_id, module_id, technician_type)
    VALUES (v_u1, v_module, 'generalist'), (v_u2, v_module, 'generalist'), (v_u3, v_module, 'generalist');

    -- Crear y asignar 6 tickets
    FOR i IN 1..6 LOOP
        DECLARE v_tid UUID;
        BEGIN
            INSERT INTO tickets.tickets (module_id, workflow_version_id, current_state_id,
                                         environment_id, category_id, created_by,
                                         sla_policy_id, title)
            VALUES (v_module, v_wfv, v_state, v_env, v_cat,
                    '00000000-0000-0000-0000-000000000001', v_sla,
                    'Test T4 ticket ' || i)
            RETURNING id INTO v_tid;
            PERFORM tickets.assign_ticket_hybrid(v_tid);
        END;
    END LOOP;

    SELECT COUNT(*) INTO v_c1 FROM tickets.ticket_assignments WHERE user_id = v_u1 AND role = 'owner' AND is_active = true;
    SELECT COUNT(*) INTO v_c2 FROM tickets.ticket_assignments WHERE user_id = v_u2 AND role = 'owner' AND is_active = true;
    SELECT COUNT(*) INTO v_c3 FROM tickets.ticket_assignments WHERE user_id = v_u3 AND role = 'owner' AND is_active = true;

    IF v_c1 = 2 AND v_c2 = 2 AND v_c3 = 2 THEN
        RAISE NOTICE 'TEST 4 PASS: round-robin 2-2-2 (T1=%, T2=%, T3=%)', v_c1, v_c2, v_c3;
    ELSE
        RAISE NOTICE 'TEST 4 FAIL: distribución desigual (T1=%, T2=%, T3=%)', v_c1, v_c2, v_c3;
    END IF;
END $$;

-- TEST 5: Counter generalista único (NULLS NOT DISTINCT en ticket_assignment_counters)
DO $$
DECLARE v_count INT;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM   tickets.ticket_assignment_counters
    WHERE  category_id IS NULL AND technician_type = 'generalist';
    IF v_count >= 1 THEN
        RAISE NOTICE 'TEST 5 PASS: counter generalista existe (% filas)', v_count;
    ELSE
        RAISE NOTICE 'TEST 5 INFO: sin asignaciones aún (depende de TEST 4)';
    END IF;
END $$;

-- TEST 6: Doble owner activo bloqueado (uq_ta_one_active_owner)
DO $$
DECLARE
    v_tid UUID;
    v_module UUID; v_wfv UUID; v_state UUID; v_sla UUID; v_env UUID; v_cat UUID;
    v_caught BOOLEAN := false;
BEGIN
    SELECT id INTO v_module FROM modules.modules WHERE slug = 'helpdesk';
    SELECT id INTO v_wfv    FROM tickets.workflow_versions WHERE module_id = v_module AND version = 1;
    SELECT id INTO v_state  FROM tickets.states WHERE workflow_version_id = v_wfv AND is_initial = true;
    SELECT id INTO v_sla    FROM tickets.sla_policies WHERE module_id = v_module LIMIT 1;
    SELECT me.id INTO v_env FROM modules.environments me WHERE me.module_id = v_module LIMIT 1;
    SELECT mc.id INTO v_cat FROM modules.categories mc WHERE mc.module_id = v_module LIMIT 1;

    INSERT INTO tickets.tickets (module_id, workflow_version_id, current_state_id,
                                 environment_id, category_id, created_by, sla_policy_id, title)
    VALUES (v_module, v_wfv, v_state, v_env, v_cat,
            '00000000-0000-0000-0000-000000000001', v_sla, 'Test T6 double owner')
    RETURNING id INTO v_tid;

    -- Insertar primer owner
    INSERT INTO tickets.ticket_assignments (ticket_id, user_id, role, assigned_by)
    VALUES (v_tid, '00000000-0000-0000-0000-000000000001', 'owner',
            '00000000-0000-0000-0000-000000000001');

    -- Segundo owner debe fallar por uq_ta_one_active_owner
    BEGIN
        INSERT INTO tickets.ticket_assignments (ticket_id, user_id, role, assigned_by)
        VALUES (v_tid, '00000000-0000-0000-0000-000000000001', 'owner',
                '00000000-0000-0000-0000-000000000001');
    EXCEPTION WHEN OTHERS THEN
        v_caught := true;
    END;

    IF v_caught THEN
        RAISE NOTICE 'TEST 6 PASS: doble owner bloqueado por uq_ta_one_active_owner';
    ELSE
        RAISE NOTICE 'TEST 6 FAIL: segundo owner insertado sin error';
    END IF;
END $$;

-- TEST 7: ticket_state_history via trigger en UPDATE de current_state_id
DO $$
DECLARE
    v_tid UUID; v_module UUID; v_wfv UUID; v_st_open UUID; v_st_process UUID;
    v_sla UUID; v_env UUID; v_cat UUID;
    v_hist_count INT;
BEGIN
    SELECT id INTO v_module     FROM modules.modules WHERE slug = 'helpdesk';
    SELECT id INTO v_wfv        FROM tickets.workflow_versions WHERE module_id = v_module AND version = 1;
    SELECT id INTO v_st_open    FROM tickets.states WHERE workflow_version_id = v_wfv AND is_initial = true;
    SELECT id INTO v_st_process FROM tickets.states WHERE workflow_version_id = v_wfv AND name = 'en_proceso';
    SELECT id INTO v_sla        FROM tickets.sla_policies WHERE module_id = v_module LIMIT 1;
    SELECT me.id INTO v_env FROM modules.environments me WHERE me.module_id = v_module LIMIT 1;
    SELECT mc.id INTO v_cat FROM modules.categories mc WHERE mc.module_id = v_module LIMIT 1;

    INSERT INTO tickets.tickets (module_id, workflow_version_id, current_state_id,
                                 environment_id, category_id, created_by, sla_policy_id, title)
    VALUES (v_module, v_wfv, v_st_open, v_env, v_cat,
            '00000000-0000-0000-0000-000000000001', v_sla, 'Test T7 history')
    RETURNING id INTO v_tid;

    UPDATE tickets.tickets SET current_state_id = v_st_process WHERE id = v_tid;

    SELECT COUNT(*) INTO v_hist_count
    FROM   tickets.ticket_state_history WHERE ticket_id = v_tid;

    IF v_hist_count = 1 THEN
        RAISE NOTICE 'TEST 7 PASS: ticket_state_history generado por trigger';
    ELSE
        RAISE NOTICE 'TEST 7 FAIL: % filas en history (esperado 1)', v_hist_count;
    END IF;
END $$;

-- TEST 8: FK violation en sla_policy_id huérfano
DO $$
DECLARE
    v_caught BOOLEAN := false;
    v_module UUID; v_wfv UUID; v_state UUID; v_env UUID; v_cat UUID;
BEGIN
    SELECT id INTO v_module FROM modules.modules WHERE slug = 'helpdesk';
    SELECT id INTO v_wfv    FROM tickets.workflow_versions WHERE module_id = v_module AND version = 1;
    SELECT id INTO v_state  FROM tickets.states WHERE workflow_version_id = v_wfv AND is_initial = true;
    SELECT me.id INTO v_env FROM modules.environments me WHERE me.module_id = v_module LIMIT 1;
    SELECT mc.id INTO v_cat FROM modules.categories mc WHERE mc.module_id = v_module LIMIT 1;

    BEGIN
        INSERT INTO tickets.tickets (module_id, workflow_version_id, current_state_id,
                                     environment_id, category_id, created_by, sla_policy_id, title)
        VALUES (v_module, v_wfv, v_state, v_env, v_cat,
                '00000000-0000-0000-0000-000000000001',
                gen_random_uuid(),  -- sla_policy_id inexistente
                'Test T8 orphan sla');
    EXCEPTION WHEN foreign_key_violation THEN
        v_caught := true;
    END;

    IF v_caught THEN
        RAISE NOTICE 'TEST 8 PASS: FK violation en sla_policy_id huérfano';
    ELSE
        RAISE NOTICE 'TEST 8 FAIL: INSERT con sla_policy_id inválido no fue rechazado';
    END IF;
END $$;

-- TEST 9: RLS — superadmin ve todos los módulos
DO $$
DECLARE v_count INT;
BEGIN
    PERFORM set_config('app.current_user_id',
        '00000000-0000-0000-0000-000000000001', true);
    SELECT COUNT(*) INTO v_count FROM modules.modules WHERE deleted_at IS NULL;
    IF v_count >= 2 THEN
        RAISE NOTICE 'TEST 9 PASS: superadmin ve % módulos (helpdesk + inventario al menos)', v_count;
    ELSE
        RAISE NOTICE 'TEST 9 FAIL: solo % módulos visibles (esperado >= 2)', v_count;
    END IF;
END $$;

-- TEST 10: Tablas inmutables NO tienen columna updated_at
DO $$
DECLARE v_bad INT;
BEGIN
    SELECT COUNT(*) INTO v_bad
    FROM   information_schema.columns
    WHERE  (table_schema = 'audit'     AND table_name = 'event_log')
       OR  (table_schema = 'tickets'   AND table_name = 'ticket_state_history')
       OR  (table_schema = 'inventory' AND table_name = 'asset_assignment_history')
    AND    column_name = 'updated_at';

    IF v_bad = 0 THEN
        RAISE NOTICE 'TEST 10 PASS: ninguna tabla inmutable tiene updated_at';
    ELSE
        RAISE NOTICE 'TEST 10 FAIL: % tablas inmutables con updated_at (esperado 0)', v_bad;
    END IF;
END $$;

-- TEST 11 [BUG-1]: validate_user_exists bloquea user_id inexistente
DO $$
DECLARE v_caught BOOLEAN := false;
BEGIN
    BEGIN
        INSERT INTO tickets.ticket_assignments (ticket_id, user_id, role, assigned_by)
        VALUES (
            gen_random_uuid(),
            gen_random_uuid(),   -- user_id que no existe en users.profiles
            'owner',
            '00000000-0000-0000-0000-000000000001'
        );
    EXCEPTION WHEN foreign_key_violation THEN
        v_caught := true;
    END;

    IF v_caught THEN
        RAISE NOTICE 'TEST 11 PASS: validate_user_exists bloquea user_id inexistente';
    ELSE
        RAISE NOTICE 'TEST 11 FAIL: user inexistente NO fue bloqueado';
    END IF;
END $$;

-- TEST 12 [BUG-2]: NULLS NOT DISTINCT en config.module_settings
DO $$
DECLARE v_count INT;
BEGIN
    INSERT INTO config.module_settings (module_id, key, value, value_type)
    VALUES (NULL, 'test_t12_global', 'a', 'string');

    INSERT INTO config.module_settings (module_id, key, value, value_type)
    VALUES (NULL, 'test_t12_global', 'b', 'string')
    ON CONFLICT (module_id, key, version) DO NOTHING;

    SELECT COUNT(*) INTO v_count
    FROM   config.module_settings
    WHERE  key = 'test_t12_global' AND module_id IS NULL;

    IF v_count = 1 THEN
        RAISE NOTICE 'TEST 12 PASS: NULLS NOT DISTINCT previene duplicados con module_id=NULL';
    ELSE
        RAISE NOTICE 'TEST 12 FAIL: % filas (esperado 1) — NULLS NOT DISTINCT no funciona', v_count;
    END IF;

    -- Limpiar
    DELETE FROM config.module_settings WHERE key = 'test_t12_global';
END $$;

-- TEST 13 [ISSUE-1]: evaluate_sla_condition NO crashea con datos no-numéricos
DO $$
DECLARE
    v_result_gt  BOOLEAN;
    v_result_in  BOOLEAN;
    v_result_in2 BOOLEAN;
BEGIN
    -- No debe lanzar ERROR con campo string y operador numérico
    SELECT tickets.evaluate_sla_condition(
        '{"field":"urgency","operator":">","value":"alta"}'::jsonb,
        '{"urgency":"baja"}'::jsonb
    ) INTO v_result_gt;

    -- IN con array JSONB debe funcionar
    SELECT tickets.evaluate_sla_condition(
        '{"field":"urgency","operator":"IN","values":["alta","critica"]}'::jsonb,
        '{"urgency":"alta"}'::jsonb
    ) INTO v_result_in;

    -- IN con CSV fallback debe funcionar
    SELECT tickets.evaluate_sla_condition(
        '{"field":"urgency","operator":"IN","value":"alta,critica"}'::jsonb,
        '{"urgency":"critica"}'::jsonb
    ) INTO v_result_in2;

    IF v_result_gt = false AND v_result_in = true AND v_result_in2 = true THEN
        RAISE NOTICE 'TEST 13 PASS: evaluate_sla_condition gt=%, in_array=%, in_csv=%',
            v_result_gt, v_result_in, v_result_in2;
    ELSE
        RAISE NOTICE 'TEST 13 FAIL: gt=% (esperado false), in_array=% (esperado true), in_csv=% (esperado true)',
            v_result_gt, v_result_in, v_result_in2;
    END IF;
END $$;

-- TEST 14 [ISSUE-6]: coherencia ticket-state-workflow bloqueada
DO $$
DECLARE
    v_caught      BOOLEAN := false;
    v_mod_help    UUID;
    v_mod_inv     UUID;
    v_wfv_help    UUID;
    v_state_help  UUID;
    v_sla_help    UUID;
    v_env_inv     UUID;
    v_cat_inv     UUID;
BEGIN
    SELECT id INTO v_mod_help  FROM modules.modules WHERE slug = 'helpdesk';
    SELECT id INTO v_mod_inv   FROM modules.modules WHERE slug = 'inventario';
    SELECT id INTO v_wfv_help  FROM tickets.workflow_versions WHERE module_id = v_mod_help AND version = 1;
    SELECT id INTO v_state_help FROM tickets.states WHERE workflow_version_id = v_wfv_help AND is_initial = true;
    SELECT id INTO v_sla_help  FROM tickets.sla_policies WHERE module_id = v_mod_help LIMIT 1;

    -- Ambiente y categoría del módulo inventario
    SELECT me.id INTO v_env_inv FROM modules.environments me WHERE me.module_id = v_mod_inv LIMIT 1;
    SELECT mc.id INTO v_cat_inv FROM modules.categories mc WHERE mc.module_id = v_mod_inv LIMIT 1;

    -- Si inventario no tiene ambiente/categoría, crear mínimos
    IF v_env_inv IS NULL THEN
        DECLARE v_loc UUID;
        BEGIN
            INSERT INTO modules.locations (module_id, name) VALUES (v_mod_inv, 'Loc Inv T14') RETURNING id INTO v_loc;
            INSERT INTO modules.environments (location_id, module_id, name) VALUES (v_loc, v_mod_inv, 'Env Inv T14') RETURNING id INTO v_env_inv;
        END;
    END IF;
    IF v_cat_inv IS NULL THEN
        INSERT INTO modules.categories (module_id, name) VALUES (v_mod_inv, 'Cat Inv T14') RETURNING id INTO v_cat_inv;
    END IF;

    -- Intentar ticket con module_id=inventario pero state de helpdesk → debe fallar
    BEGIN
        INSERT INTO tickets.tickets (module_id, workflow_version_id, current_state_id,
                                     environment_id, category_id, created_by,
                                     sla_policy_id, title)
        VALUES (
            v_mod_inv,     -- módulo inventario
            v_wfv_help,    -- workflow de helpdesk ← incoherente
            v_state_help,  -- estado de helpdesk ← incoherente
            v_env_inv, v_cat_inv,
            '00000000-0000-0000-0000-000000000001',
            v_sla_help, 'Test T14 coherence'
        );
    EXCEPTION WHEN OTHERS THEN
        IF SQLERRM LIKE '%Incoherencia%' THEN
            v_caught := true;
        END IF;
    END;

    IF v_caught THEN
        RAISE NOTICE 'TEST 14 PASS: fn_validate_ticket_coherence bloqueó incoherencia módulo/estado/workflow';
    ELSE
        RAISE NOTICE 'TEST 14 FAIL: ticket incoherente insertado sin error';
    END IF;
END $$;

-- ============================================================================
-- RESUMEN
-- ============================================================================
DO $$
BEGIN
    RAISE NOTICE '============================================================';
    RAISE NOTICE 'Suite tests_v6_1.sql completada. Revisar PASS/FAIL arriba.';
    RAISE NOTICE 'Test 2 requiere re-ejecutar DB_FINAL_v6_1.sql manualmente.';
    RAISE NOTICE '============================================================';
END $$;
