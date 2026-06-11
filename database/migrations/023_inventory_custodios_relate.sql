-- Migration 023: Múltiples custodios + acciones de relación en historial
-- Aplicar en Railway antes de usar múltiples custodios o las nuevas etiquetas de historial

-- 1. Columnas opcionales de turno/horario en asset_assignments
ALTER TABLE inventory.asset_assignments
  ADD COLUMN IF NOT EXISTS shift       varchar(20),
  ADD COLUMN IF NOT EXISTS hours_start varchar(10),
  ADD COLUMN IF NOT EXISTS hours_end   varchar(10);

-- 2. Extender CHECK constraint de historial para incluir acciones de relación
ALTER TABLE inventory.asset_assignment_history
  DROP CONSTRAINT IF EXISTS asset_assignment_history_action_check;

ALTER TABLE inventory.asset_assignment_history
  ADD CONSTRAINT asset_assignment_history_action_check
  CHECK (action IN (
    'asignado', 'devuelto', 'transferido',
    'dado_de_baja', 'reparacion',
    'asociado', 'desasociado'
  ));
