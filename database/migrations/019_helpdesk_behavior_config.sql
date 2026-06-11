-- Configuración de comportamiento operativo extendido por módulo
-- Agrega: modo de especialización de técnicos, auto-cierre de tickets

ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS specialization_mode TEXT NOT NULL DEFAULT 'general'
    CONSTRAINT chk_modules_specialization_mode
    CHECK (specialization_mode IN ('general', 'specialist', 'hybrid')),

  ADD COLUMN IF NOT EXISTS auto_close_hours INTEGER NOT NULL DEFAULT 48
    CONSTRAINT chk_auto_close_hours CHECK (auto_close_hours > 0 AND auto_close_hours <= 720);

COMMENT ON COLUMN modules.modules.specialization_mode IS 'general = todos atienden todo | specialist = según especialidad | hybrid = mezcla (default: general)';
COMMENT ON COLUMN modules.modules.auto_close_hours    IS 'Horas hasta auto-cierre cuando usuario no responde. Default: 48 (2 días). Rango: 1-720h.';
