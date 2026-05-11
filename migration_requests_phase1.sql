-- ============================================================================
-- MIGRATION: requests Phase 1 (2026-05-11)
-- 1. Add priority column to requests.admin_requests
-- 2. Add 'cancelled' to status CHECK constraint
-- 3. Create requests.request_timeline table
-- ============================================================================

-- 1. priority column
ALTER TABLE requests.admin_requests
  ADD COLUMN IF NOT EXISTS priority VARCHAR(20) NOT NULL DEFAULT 'media'
  CHECK (priority IN ('baja', 'media', 'alta', 'critica'));

-- 2. Expand status CHECK to include 'cancelled'
-- PostgreSQL auto-names inline CHECK as {table}_{column}_check
ALTER TABLE requests.admin_requests
  DROP CONSTRAINT IF EXISTS admin_requests_status_check;

ALTER TABLE requests.admin_requests
  ADD CONSTRAINT admin_requests_status_check
  CHECK (status IN ('pending', 'under_review', 'approved', 'rejected', 'cancelled'));

-- 3. Timeline table for audit trail
CREATE TABLE IF NOT EXISTS requests.request_timeline (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id  UUID        NOT NULL REFERENCES requests.admin_requests(id) ON DELETE CASCADE,
    actor_id    UUID        NOT NULL,
    action      VARCHAR(50) NOT NULL,
    old_status  VARCHAR(20) NULL,
    new_status  VARCHAR(20) NULL,
    notes       TEXT        NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_req_timeline_request
    ON requests.request_timeline(request_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_req_timeline_actor
    ON requests.request_timeline(actor_id);
