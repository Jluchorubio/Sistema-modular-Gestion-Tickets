-- Migration 049: Explicit technician specialization mappings + assignment mode expansion
-- Replaces the heuristic skill-based strategy (historical ticket count) with
-- explicit admin-managed damage_type / category → technician associations.

-- ── 1. Specialization table ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS modules.technician_specializations (
  id             UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id        UUID        NOT NULL REFERENCES users.profiles(id)      ON DELETE CASCADE,
  module_id      UUID        NOT NULL REFERENCES modules.modules(id)     ON DELETE CASCADE,
  damage_type_id UUID                 REFERENCES tickets.damage_types(id) ON DELETE CASCADE,
  category_id    UUID                 REFERENCES modules.categories(id)   ON DELETE CASCADE,
  is_active      BOOLEAN     NOT NULL DEFAULT true,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_spec_has_target CHECK (
    damage_type_id IS NOT NULL OR category_id IS NOT NULL
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tech_spec_dmg
  ON modules.technician_specializations (user_id, module_id, damage_type_id)
  WHERE damage_type_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_tech_spec_cat
  ON modules.technician_specializations (user_id, module_id, category_id)
  WHERE category_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tech_spec_module
  ON modules.technician_specializations (module_id, is_active);

COMMENT ON TABLE modules.technician_specializations IS
  'Explicit tech → damage_type/category specialization. Used by assignment engine for '
  'round_robin_skill, skill_only, and balanced modes.';

-- ── 2. Drop phantom columns (never read by any business logic) ────────────────
ALTER TABLE modules.modules
  DROP COLUMN IF EXISTS priority_mode,
  DROP COLUMN IF EXISTS priority_period_start,
  DROP COLUMN IF EXISTS priority_period_end,
  DROP COLUMN IF EXISTS specialization_mode;

-- ── 3. Expand assignment_mode allowed values ──────────────────────────────────
ALTER TABLE modules.modules
  DROP CONSTRAINT IF EXISTS chk_modules_assignment_mode;

-- Migrate legacy values first
UPDATE modules.modules SET assignment_mode = 'round_robin_skill' WHERE assignment_mode IN ('skill_based');
UPDATE modules.modules SET assignment_mode = 'balanced'           WHERE assignment_mode = 'hybrid';

ALTER TABLE modules.modules
  ADD CONSTRAINT chk_modules_assignment_mode
  CHECK (assignment_mode IN ('manual', 'round_robin', 'round_robin_skill', 'skill_only', 'balanced'));
