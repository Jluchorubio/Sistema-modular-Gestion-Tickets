-- Migration 017: dismissed_at column on notification_logs
-- Allows users to dismiss notifications without deleting rows (partitioned table)
-- Idempotent — safe to run multiple times

ALTER TABLE notifications.notification_logs
  ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ NULL;
