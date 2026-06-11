-- Migration 013: Drop legacy org tables
-- Prerequisite: migration 011 (dynamic org nodes) must be applied.
-- All data from headquarters/departments/areas/positions was migrated to org.nodes in 011.
-- Apply: psql $DATABASE_URL -f migrations/013_drop_legacy_org_tables.sql

BEGIN;

-- 1. Drop FK columns on users.profiles that reference the old tables.
--    The new columns (org_node_id, position_node_id) already carry this relationship.
ALTER TABLE users.profiles DROP COLUMN IF EXISTS headquarters_id;
ALTER TABLE users.profiles DROP COLUMN IF EXISTS department_id;
ALTER TABLE users.profiles DROP COLUMN IF EXISTS area_id;
ALTER TABLE users.profiles DROP COLUMN IF EXISTS position_id;

-- 2. Drop legacy org tables (CASCADE handles the FK from org.areas → org.departments).
DROP TABLE IF EXISTS org.areas        CASCADE;
DROP TABLE IF EXISTS org.departments  CASCADE;
DROP TABLE IF EXISTS org.headquarters CASCADE;
DROP TABLE IF EXISTS org.positions    CASCADE;

COMMIT;

-- VERIFY
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'org' ORDER BY table_name;
-- SELECT column_name FROM information_schema.columns WHERE table_schema = 'users' AND table_name = 'profiles' ORDER BY ordinal_position;
