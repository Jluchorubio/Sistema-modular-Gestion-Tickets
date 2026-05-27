-- Migration 010: Audit log for system configuration changes
-- Apply: psql $DATABASE_URL -f migrations/010_system_config_audit_log.sql

BEGIN;

CREATE TABLE IF NOT EXISTS audit.system_configuration_logs (
  id             uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid         NOT NULL REFERENCES users.profiles(id) ON DELETE SET NULL,
  action         varchar(50)  NOT NULL CHECK (action IN ('CREATE','UPDATE','DELETE')),
  entity_type    varchar(100) NOT NULL,
  entity_id      uuid,
  previous_value jsonb,
  new_value      jsonb,
  reason         text         NOT NULL,
  ip_address     inet,
  user_agent     text,
  verified_2fa   boolean      NOT NULL DEFAULT false,
  created_at     timestamptz  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_syscfg_audit_user     ON audit.system_configuration_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_syscfg_audit_entity   ON audit.system_configuration_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_syscfg_audit_created  ON audit.system_configuration_logs(created_at DESC);

COMMIT;

-- VERIFY
-- \d audit.system_configuration_logs
-- SELECT id, action, entity_type, reason, verified_2fa, created_at FROM audit.system_configuration_logs LIMIT 5;
