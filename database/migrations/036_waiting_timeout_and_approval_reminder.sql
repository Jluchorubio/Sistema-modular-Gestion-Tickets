-- Migration 036: waiting_timeout_hours per module + approval reminder tracking

-- ─── 1. Configurable en_espera timeout per module ────────────────────────────
-- WaitingTimeoutService checks this. NULL = feature disabled for that module.
ALTER TABLE modules.modules
  ADD COLUMN IF NOT EXISTS waiting_timeout_hours INTEGER DEFAULT 72
    CONSTRAINT chk_waiting_timeout_hours
      CHECK (waiting_timeout_hours > 0 AND waiting_timeout_hours <= 2160);

COMMENT ON COLUMN modules.modules.waiting_timeout_hours
  IS 'Hours before a paused (en_espera) ticket triggers a timeout notification. Default: 72 (3 days). NULL disables. Max: 2160 (90 days).';

-- ─── 2. Approval reminder tracking ──────────────────────────────────────────
-- Prevents sending the 24h-before-expiry reminder more than once per approval.
ALTER TABLE tickets.ticket_approvals
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN tickets.ticket_approvals.reminder_sent_at
  IS 'Timestamp when the 24h-before-expiry reminder was sent. NULL = not yet sent.';
