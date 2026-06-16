-- Migration 048: approval_timeout_hours per module
-- Replaces the hardcoded 48h in tickets.generate_approval_token call

ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS approval_timeout_hours INTEGER NOT NULL DEFAULT 48
    CONSTRAINT chk_approval_timeout_hours CHECK (approval_timeout_hours >= 1 AND approval_timeout_hours <= 720);

COMMENT ON COLUMN modules.modules.approval_timeout_hours IS
  'Horas hasta que expira el token de aprobación cuando un ticket entra en estado de aprobación. Default: 48h.';
