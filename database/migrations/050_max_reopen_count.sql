-- Migration 050: configurable max reopen count per module
-- When a ticket's approval expires more than max_reopen_count times it is escalated
-- and jefe_tecnico is notified. Default = 10 (effectively unlimited for most modules).

ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS max_reopen_count INTEGER NOT NULL DEFAULT 10
    CONSTRAINT chk_max_reopen_count CHECK (max_reopen_count >= 1 AND max_reopen_count <= 100);

COMMENT ON COLUMN modules.modules.max_reopen_count IS
  'Maximum times a ticket can be re-opened after approval expiry before escalation. Default 10.';
