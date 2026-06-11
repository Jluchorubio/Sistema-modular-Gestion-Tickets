-- Migration 011: Dynamic org structure (replaces rigid headquarters/departments/areas/positions)
-- Apply: psql $DATABASE_URL -f migrations/011_dynamic_org_nodes.sql
--
-- Strategy:
--   1. Create org.structure_types  — defines categories of org nodes (Sede, Depto, Área, Cargo…)
--   2. Create org.nodes            — tree of actual org units
--   3. Seed default structure types
--   4. Migrate existing data from old rigid tables → org.nodes
--   5. Add org_node_id + position_node_id to users.profiles (nullable, backward-compatible)
-- Old tables kept intact until migration 013 (Phase 6) drops them.

BEGIN;

-- ── 1. Structure types ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org.structure_types (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  name        varchar(100) NOT NULL,
  slug        varchar(50)  NOT NULL UNIQUE,
  description text,
  weight      integer      NOT NULL DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
  parent_type_id uuid REFERENCES org.structure_types(id) ON DELETE SET NULL,
  allows_users   boolean  NOT NULL DEFAULT true,
  is_active      boolean  NOT NULL DEFAULT true,
  sort_order     integer  NOT NULL DEFAULT 10,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Org nodes ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS org.nodes (
  id          uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  type_id     uuid         NOT NULL REFERENCES org.structure_types(id),
  parent_id   uuid         REFERENCES org.nodes(id) ON DELETE SET NULL,
  name        varchar(200) NOT NULL,
  code        varchar(50),
  description text,
  weight      integer      NOT NULL DEFAULT 5 CHECK (weight BETWEEN 1 AND 10),
  address     text,
  city        varchar(100),
  country     varchar(100),
  phone       varchar(30),
  email       varchar(255),
  metadata    jsonb,
  is_active   boolean      NOT NULL DEFAULT true,
  sort_order  integer      NOT NULL DEFAULT 10,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_nodes_type     ON org.nodes(type_id);
CREATE INDEX IF NOT EXISTS idx_org_nodes_parent   ON org.nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_org_nodes_active   ON org.nodes(is_active);

-- ── 3. Seed default structure types ─────────────────────────────────────────

INSERT INTO org.structure_types (id, name, slug, description, weight, allows_users, sort_order)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'Sede',          'sede',          'Ubicación física principal',              5, true,  10),
  ('10000000-0000-0000-0000-000000000002', 'Departamento',  'departamento',  'División funcional de la organización',   5, true,  20),
  ('10000000-0000-0000-0000-000000000003', 'Área',          'area',          'Subdivisión de un departamento',          5, true,  30),
  ('10000000-0000-0000-0000-000000000004', 'Cargo',         'cargo',         'Rol o posición jerárquica del empleado',  5, false, 40)
ON CONFLICT (slug) DO NOTHING;

-- Set parent_type relationships
UPDATE org.structure_types SET parent_type_id = '10000000-0000-0000-0000-000000000001' WHERE slug = 'departamento';
UPDATE org.structure_types SET parent_type_id = '10000000-0000-0000-0000-000000000002' WHERE slug = 'area';

-- ── 4. Migrate existing data → org.nodes ────────────────────────────────────
-- Skip silently if legacy tables don't exist (clean deployments where
-- migration 013 ran before this, or SCHEMA_MASTER already omitted them).

DO $$
BEGIN
  -- 4a. Sedes
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='org' AND table_name='headquarters') THEN
    INSERT INTO org.nodes (id, type_id, name, address, city, country, phone, email, is_active, weight, created_at, updated_at)
    SELECT id, '10000000-0000-0000-0000-000000000001', name, address, city, country, phone, email, is_active, 5, created_at, updated_at
    FROM org.headquarters ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 4b. Departamentos
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='org' AND table_name='departments') THEN
    INSERT INTO org.nodes (id, type_id, name, description, is_active, weight, created_at, updated_at)
    SELECT id, '10000000-0000-0000-0000-000000000002', name, description, is_active, 5, created_at, updated_at
    FROM org.departments ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 4c. Áreas
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='org' AND table_name='areas') THEN
    INSERT INTO org.nodes (id, type_id, parent_id, name, description, is_active, weight, created_at, updated_at)
    SELECT id, '10000000-0000-0000-0000-000000000003', department_id, name, description, is_active, 5, created_at, updated_at
    FROM org.areas ON CONFLICT (id) DO NOTHING;
  END IF;

  -- 4d. Cargos/Positions
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema='org' AND table_name='positions') THEN
    INSERT INTO org.nodes (id, type_id, name, description, weight, is_active, created_at, updated_at)
    SELECT id, '10000000-0000-0000-0000-000000000004', name, description, level, is_active, created_at, updated_at
    FROM org.positions ON CONFLICT (id) DO NOTHING;
  END IF;
END $$;

-- ── 5. Add org_node_id + position_node_id to users.profiles ─────────────────

ALTER TABLE users.profiles
  ADD COLUMN IF NOT EXISTS org_node_id      uuid REFERENCES org.nodes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS position_node_id uuid REFERENCES org.nodes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_org_node      ON users.profiles(org_node_id);
CREATE INDEX IF NOT EXISTS idx_profiles_position_node ON users.profiles(position_node_id);

-- Back-fill only if legacy columns exist (dropped by migration 013 on upgrade paths)
DO $$
BEGIN
  -- Back-fill position_node_id from position_id if column still exists
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema='users' AND table_name='profiles' AND column_name='position_id') THEN
    UPDATE users.profiles SET position_node_id = position_id
    WHERE position_id IS NOT NULL AND position_node_id IS NULL;
  END IF;

  -- Back-fill org_node_id from legacy columns if they still exist
  IF EXISTS (SELECT FROM information_schema.columns WHERE table_schema='users' AND table_name='profiles' AND column_name='area_id') THEN
    UPDATE users.profiles
    SET org_node_id = COALESCE(area_id, department_id, headquarters_id)
    WHERE org_node_id IS NULL
      AND (area_id IS NOT NULL OR department_id IS NOT NULL OR headquarters_id IS NOT NULL);
  END IF;
END $$;

-- ── 6. updated_at triggers for new tables ───────────────────────────────────

CREATE OR REPLACE TRIGGER trg_org_structure_types_updated_at
  BEFORE UPDATE ON org.structure_types
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE TRIGGER trg_org_nodes_updated_at
  BEFORE UPDATE ON org.nodes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- VERIFY
-- SELECT t.name AS type, n.name, n.weight, n.is_active FROM org.nodes n JOIN org.structure_types t ON t.id = n.type_id ORDER BY t.sort_order, n.name LIMIT 30;
-- SELECT count(*) FROM users.profiles WHERE position_node_id IS NOT NULL;
