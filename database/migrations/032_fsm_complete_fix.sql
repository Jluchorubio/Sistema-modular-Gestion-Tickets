-- =============================================================================
-- Migration 032: FSM complete fix
-- Adds missing columns (is_approval_state, is_pause_state, variant, allowed_roles)
-- that were previously applied as manual DB patches.
-- Updates state flags and transition roles for current FSM spec.
-- IDEMPOTENTE — safe to run multiple times.
-- =============================================================================

-- ─── 1. tickets.states: add missing columns ──────────────────────────────────

ALTER TABLE tickets.states
  ADD COLUMN IF NOT EXISTS is_approval_state boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS is_pause_state    boolean NOT NULL DEFAULT false;

-- ─── 2. tickets.transitions: add missing columns ─────────────────────────────

ALTER TABLE tickets.transitions
  ADD COLUMN IF NOT EXISTS variant       varchar(50)  DEFAULT 'default',
  ADD COLUMN IF NOT EXISTS allowed_roles text[]       DEFAULT '{}';

-- ─── 3. Set state flags based on state name ──────────────────────────────────
-- Covers both old names (realizado/reproceso) and new names (resuelto/rechazado)

-- is_approval_state: ticket resolved, waiting user acceptance/rating
UPDATE tickets.states
SET is_approval_state = true
WHERE name IN ('realizado', 'resuelto')
  AND is_approval_state = false;

-- is_pause_state: SLA paused, waiting external response
UPDATE tickets.states
SET is_pause_state = true
WHERE name = 'en_espera'
  AND is_pause_state = false;

-- reproceso should be final (was wrong in original seed)
UPDATE tickets.states
SET is_final = true
WHERE name = 'reproceso'
  AND is_final = false;

-- rechazado is final
UPDATE tickets.states
SET is_final = true
WHERE name = 'rechazado'
  AND is_final = false;

-- ─── 4. Set transition variants (UI button color) ────────────────────────────

UPDATE tickets.transitions SET variant = 'primary'
WHERE name IN ('Tomar ticket', 'Reanudar', 'Marcar resuelto', 'Marcar realizado');

UPDATE tickets.transitions SET variant = 'warning'
WHERE name IN ('Solicitar información');

UPDATE tickets.transitions SET variant = 'success'
WHERE name IN ('Aprobar y cerrar', 'Cerrar');

UPDATE tickets.transitions SET variant = 'danger'
WHERE name IN ('Rechazar', 'Rechazar solución', 'Retomar para reproceso');

UPDATE tickets.transitions SET variant = 'default'
WHERE variant IS NULL;

-- ─── 5. Set allowed_roles per transition ─────────────────────────────────────
-- Supersedes migration 029 — covers both old and new FSM state names.
-- Empty array = all roles allowed (superadmin always bypasses).

-- abierto → en_proceso: Tomar ticket
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Tomar ticket';

-- en_proceso → en_espera: Solicitar información
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Solicitar información';

-- en_espera → en_proceso: Reanudar
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Reanudar';

-- en_proceso → resuelto/realizado: Marcar resuelto
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name IN ('Marcar resuelto', 'Marcar realizado');

-- * → rechazado: Rechazar — jefe and admin only
UPDATE tickets.transitions
SET allowed_roles = ARRAY['jefe_tecnico', 'admin_modulo']
WHERE name = 'Rechazar';

-- resuelto/realizado → cerrado: close (via approve endpoint, also guard here)
UPDATE tickets.transitions
SET allowed_roles = ARRAY['usuario', 'jefe_tecnico', 'admin_modulo']
WHERE name IN ('Aprobar y cerrar', 'Cerrar');

-- resuelto → en_proceso: Reabrir (via reject endpoint)
UPDATE tickets.transitions
SET allowed_roles = ARRAY['usuario', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Reabrir';

-- resuelto → reproceso: Rechazar solución (legacy)
UPDATE tickets.transitions
SET allowed_roles = ARRAY['usuario', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Rechazar solución';

-- reproceso → en_proceso: Retomar (only tech roles)
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Retomar para reproceso';

-- ─── 6. Fix create_helpdesk_module variant column reference ──────────────────
-- No data changes needed — function is updated in SCHEMA_MASTER.sql separately.

RAISE NOTICE 'Migration 032 applied: FSM complete fix — states flags + transition variants + allowed_roles';
