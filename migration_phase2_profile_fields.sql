-- ============================================================================
-- MIGRATION: Phase 2 — Extended user profile fields (2026-05-15)
-- Adds: phone_prefix, country, state_province, city, birth_date,
--       national_id, gender, emergency_contact_name, emergency_contact_phone
-- Apply after: DB_FINAL_v6_1.sql + DB_PATCH_2.sql
-- ============================================================================

ALTER TABLE users.profiles
  ADD COLUMN IF NOT EXISTS phone_prefix              VARCHAR(10)  NULL,
  ADD COLUMN IF NOT EXISTS country                   VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS state_province            VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS city                      VARCHAR(150) NULL,
  ADD COLUMN IF NOT EXISTS birth_date                DATE         NULL,
  ADD COLUMN IF NOT EXISTS national_id               VARCHAR(50)  NULL,
  ADD COLUMN IF NOT EXISTS gender                    VARCHAR(30)  NULL
    CONSTRAINT chk_profiles_gender
      CHECK (gender IN ('masculino', 'femenino', 'no_binario', 'prefiero_no_decir', 'otro')),
  ADD COLUMN IF NOT EXISTS emergency_contact_name    VARCHAR(100) NULL,
  ADD COLUMN IF NOT EXISTS emergency_contact_phone   VARCHAR(50)  NULL;

COMMENT ON COLUMN users.profiles.phone_prefix            IS 'Prefijo internacional (ej: +57, +1). Vinculado a phone.';
COMMENT ON COLUMN users.profiles.country                 IS 'País de residencia (nombre en español).';
COMMENT ON COLUMN users.profiles.state_province          IS 'Departamento o estado de residencia.';
COMMENT ON COLUMN users.profiles.city                    IS 'Ciudad de residencia.';
COMMENT ON COLUMN users.profiles.birth_date              IS 'Fecha de nacimiento.';
COMMENT ON COLUMN users.profiles.national_id             IS 'Número de documento de identidad.';
COMMENT ON COLUMN users.profiles.gender                  IS 'Género: masculino | femenino | no_binario | prefiero_no_decir | otro.';
COMMENT ON COLUMN users.profiles.emergency_contact_name  IS 'Nombre del contacto de emergencia.';
COMMENT ON COLUMN users.profiles.emergency_contact_phone IS 'Teléfono del contacto de emergencia (con prefijo).';
