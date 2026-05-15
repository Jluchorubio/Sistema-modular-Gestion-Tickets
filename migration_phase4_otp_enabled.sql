-- Phase 4: Email OTP toggle (2FA per-user)
-- Run against the production Railway PostgreSQL DB

ALTER TABLE auth.credentials
  ADD COLUMN IF NOT EXISTS otp_enabled BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN auth.credentials.otp_enabled IS
  'When false, user skips email OTP on login. Default true for security.';
