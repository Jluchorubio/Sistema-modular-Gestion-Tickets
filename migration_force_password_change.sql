-- Migration: add force_password_change to auth.credentials
-- Run once against the target database.

ALTER TABLE auth.credentials
  ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN auth.credentials.force_password_change
  IS 'When true, user must change password on next login (set for auto-created accounts).';
