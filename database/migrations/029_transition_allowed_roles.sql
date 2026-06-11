-- Migration 029: Add allowed_roles to transitions + seed role matrix
-- IDEMPOTENTE.

ALTER TABLE tickets.transitions
  ADD COLUMN IF NOT EXISTS allowed_roles text[] DEFAULT '{}';

-- ─── Role matrix ────────────────────────────────────────────────────────────
-- Empty array = all authenticated roles can execute (superadmin always bypasses).

-- Tomar ticket / abierto → en_proceso: only tecnico, jefe, admin
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Tomar ticket';

-- Reanudar / en_espera → en_proceso
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Reanudar';

-- Solicitar información / en_proceso → en_espera
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Solicitar información';

-- Marcar realizado / en_proceso → realizado
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Marcar realizado';

-- Rechazar / en_proceso → rechazado: jefe and admin only
UPDATE tickets.transitions
SET allowed_roles = ARRAY['jefe_tecnico', 'admin_modulo']
WHERE name = 'Rechazar';

-- Marcar resuelto / en_proceso → resuelto
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Marcar resuelto';

-- Aprobar y cerrar / realizado → cerrado: usuario (ticket creator) + jefe + admin
UPDATE tickets.transitions
SET allowed_roles = ARRAY['usuario', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Aprobar y cerrar';

-- Rechazar solución / realizado → reproceso
UPDATE tickets.transitions
SET allowed_roles = ARRAY['usuario', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Rechazar solución';

-- Retomar para reproceso / reproceso → en_proceso
UPDATE tickets.transitions
SET allowed_roles = ARRAY['tecnico', 'jefe_tecnico', 'admin_modulo']
WHERE name = 'Retomar para reproceso';

-- Cerrar / resuelto → cerrado: jefe and admin only
UPDATE tickets.transitions
SET allowed_roles = ARRAY['jefe_tecnico', 'admin_modulo']
WHERE name = 'Cerrar';

-- Reabrir / resuelto → en_proceso
UPDATE tickets.transitions
SET allowed_roles = ARRAY['jefe_tecnico', 'admin_modulo']
WHERE name = 'Reabrir';
