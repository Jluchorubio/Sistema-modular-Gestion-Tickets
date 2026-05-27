-- Migration 012: Priority formula configuration
-- Stores the weighted coefficients for the multidimensional priority engine.
-- Apply: psql $DATABASE_URL -f migrations/012_priority_formula_config.sql

BEGIN;

CREATE TABLE IF NOT EXISTS config.priority_formula (
  id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  w_cargo      numeric(4,2) NOT NULL DEFAULT 0.25 CHECK (w_cargo  >= 0 AND w_cargo  <= 1),
  w_nodo       numeric(4,2) NOT NULL DEFAULT 0.35 CHECK (w_nodo   >= 0 AND w_nodo   <= 1),
  w_daño       numeric(4,2) NOT NULL DEFAULT 0.40 CHECK (w_daño   >= 0 AND w_daño   <= 1),
  threshold_critica numeric(4,2) NOT NULL DEFAULT 9.0,
  threshold_alta    numeric(4,2) NOT NULL DEFAULT 7.0,
  threshold_media   numeric(4,2) NOT NULL DEFAULT 5.0,
  description  text,
  is_active    boolean      NOT NULL DEFAULT true,
  created_at   timestamptz  NOT NULL DEFAULT now(),
  updated_at   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT chk_weights_sum CHECK (round(w_cargo + w_nodo + w_daño, 2) = 1.00)
);

-- Only one active formula at a time
CREATE UNIQUE INDEX IF NOT EXISTS uq_priority_formula_active
  ON config.priority_formula (is_active)
  WHERE is_active = TRUE;

-- Seed default formula
INSERT INTO config.priority_formula (w_cargo, w_nodo, w_daño, description)
VALUES (0.25, 0.35, 0.40, 'Fórmula por defecto: cargo 25% · nodo org 35% · daño 40%')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE TRIGGER trg_priority_formula_updated_at
  BEFORE UPDATE ON config.priority_formula
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

COMMIT;

-- VERIFY
-- SELECT * FROM config.priority_formula;
-- SELECT w_cargo + w_nodo + w_daño AS total FROM config.priority_formula;
