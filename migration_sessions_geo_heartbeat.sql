-- ─── Migration: Sessions Geo + Heartbeat Online Status ───────────────────────
-- Adds geolocation data to sessions and last_seen_at to profiles for
-- online/offline detection via heartbeat polling.
-- Run: psql -d <db> -f migration_sessions_geo_heartbeat.sql

BEGIN;

-- 1. Geo columns on auth.sessions (populated async after login via ip-api.com)
ALTER TABLE auth.sessions
  ADD COLUMN IF NOT EXISTS geo_city         VARCHAR(100),
  ADD COLUMN IF NOT EXISTS geo_country      VARCHAR(100),
  ADD COLUMN IF NOT EXISTS geo_country_code CHAR(2),
  ADD COLUMN IF NOT EXISTS geo_lat          DECIMAL(8,5),
  ADD COLUMN IF NOT EXISTS geo_lon          DECIMAL(8,5);

-- 2. last_seen_at on users.profiles — updated by heartbeat endpoint every 60s
ALTER TABLE users.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;

-- 3. Index for fast online status queries
CREATE INDEX IF NOT EXISTS idx_profiles_last_seen_at
  ON users.profiles (last_seen_at)
  WHERE last_seen_at IS NOT NULL;

COMMIT;
