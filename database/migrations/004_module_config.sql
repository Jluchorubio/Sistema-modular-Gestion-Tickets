-- Configuración operativa por módulo
-- Agrega campos para: modo de acceso, asignación de tickets, gestión de prioridad

ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS access_mode TEXT NOT NULL DEFAULT 'request'
    CONSTRAINT chk_modules_access_mode
    CHECK (access_mode IN ('open', 'request')),

  ADD COLUMN IF NOT EXISTS assignment_mode TEXT NOT NULL DEFAULT 'manual'
    CONSTRAINT chk_modules_assignment_mode
    CHECK (assignment_mode IN ('manual', 'round_robin', 'hybrid')),

  ADD COLUMN IF NOT EXISTS priority_mode TEXT NOT NULL DEFAULT 'auto'
    CONSTRAINT chk_modules_priority_mode
    CHECK (priority_mode IN ('auto', 'manual')),

  ADD COLUMN IF NOT EXISTS priority_editors TEXT NOT NULL DEFAULT 'jefe_tecnico'
    CONSTRAINT chk_modules_priority_editors
    CHECK (priority_editors IN ('jefe_tecnico', 'any_tech')),

  ADD COLUMN IF NOT EXISTS priority_period_start DATE,
  ADD COLUMN IF NOT EXISTS priority_period_end   DATE;

COMMENT ON COLUMN modules.modules.access_mode          IS 'open = libre, request = requiere solicitud (default)';
COMMENT ON COLUMN modules.modules.assignment_mode      IS 'manual | round_robin | hybrid';
COMMENT ON COLUMN modules.modules.priority_mode        IS 'auto = sistema, manual = editores autorizados';
COMMENT ON COLUMN modules.modules.priority_editors     IS 'jefe_tecnico | any_tech (solo aplica si priority_mode = manual)';
COMMENT ON COLUMN modules.modules.priority_period_start IS 'Inicio del período de organización de tickets por prioridad';
COMMENT ON COLUMN modules.modules.priority_period_end   IS 'Fin del período de organización de tickets por prioridad';
