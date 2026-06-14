-- 044_dynamic_ticket_levels.sql
-- Tablas configurables para niveles de prioridad, urgencia e impacto de tickets.
-- El PriorityEngine lee bonus/orden de estas tablas en lugar de constantes hardcodeadas.

CREATE TABLE IF NOT EXISTS config.priority_levels (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text        NOT NULL UNIQUE,
  label      text        NOT NULL,
  sort_order int         NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT TRUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config.urgency_levels (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text         NOT NULL UNIQUE,
  label      text         NOT NULL,
  bonus      numeric(5,2) NOT NULL DEFAULT 0.00,
  sort_order int          NOT NULL DEFAULT 0,
  is_active  boolean      NOT NULL DEFAULT TRUE,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS config.impact_levels (
  id         uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text         NOT NULL UNIQUE,
  label      text         NOT NULL,
  bonus      numeric(5,2) NOT NULL DEFAULT 0.00,
  sort_order int          NOT NULL DEFAULT 0,
  is_active  boolean      NOT NULL DEFAULT TRUE,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);

-- Seed priority levels (orden ascendente de severidad)
INSERT INTO config.priority_levels (slug, label, sort_order) VALUES
  ('baja',    'Baja',    1),
  ('media',   'Media',   2),
  ('alta',    'Alta',    3),
  ('critica', 'Crítica', 4)
ON CONFLICT (slug) DO NOTHING;

-- Seed urgency levels (bonus = URGENCY_BONUS hardcodeado anterior)
INSERT INTO config.urgency_levels (slug, label, bonus, sort_order) VALUES
  ('baja',    'Baja',    0.00, 1),
  ('media',   'Media',   0.50, 2),
  ('alta',    'Alta',    1.00, 3),
  ('urgente', 'Urgente', 1.50, 4)
ON CONFLICT (slug) DO NOTHING;

-- Seed impact levels (bonus = IMPACT_BONUS hardcodeado anterior)
INSERT INTO config.impact_levels (slug, label, bonus, sort_order) VALUES
  ('bajo',    'Bajo',    0.00, 1),
  ('medio',   'Medio',   0.50, 2),
  ('alto',    'Alto',    1.00, 3),
  ('critico', 'Crítico', 1.50, 4)
ON CONFLICT (slug) DO NOTHING;
