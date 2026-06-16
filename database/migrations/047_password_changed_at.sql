-- Migration 047: Add password_changed_at to auth.credentials
-- Enables enforcement of expiry_days from password policy

ALTER TABLE auth.credentials
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill: use created_at as baseline for existing credentials
UPDATE auth.credentials
SET password_changed_at = created_at
WHERE password_changed_at = now();  -- only touches rows that got the DEFAULT now()

COMMENT ON COLUMN auth.credentials.password_changed_at
  IS 'Timestamp of last password change. Used to enforce expiry_days from org password policy.';
