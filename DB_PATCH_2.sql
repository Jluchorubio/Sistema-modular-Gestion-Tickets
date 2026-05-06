-- ══════════════════════════════════════════════════════════════════════
-- DB PATCH 2 — Global Roles + Module Image URL
-- Apply on top of DB_FINAL_v6_1.sql (Railway DB)
-- ══════════════════════════════════════════════════════════════════════

-- 1. Global roles catalogue
CREATE TABLE IF NOT EXISTS config.global_roles (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(50) NOT NULL UNIQUE,
    description TEXT,
    is_active   BOOLEAN     NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO config.global_roles (name, description) VALUES
  ('usuario',    'Usuario estándar del sistema'),
  ('tecnico',    'Técnico con acceso a módulos asignados'),
  ('supervisor', 'Supervisor de módulos'),
  ('admin',      'Administrador de módulos')
ON CONFLICT (name) DO NOTHING;

-- 2. Add global_role_id to users.profiles
ALTER TABLE users.profiles
  ADD COLUMN IF NOT EXISTS global_role_id UUID REFERENCES config.global_roles(id);

-- Default 'usuario' for all existing users without a global role
UPDATE users.profiles
SET    global_role_id = (SELECT id FROM config.global_roles WHERE name = 'usuario')
WHERE  global_role_id IS NULL;

-- 3. Add image_url to modules.modules
ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS image_url TEXT;
