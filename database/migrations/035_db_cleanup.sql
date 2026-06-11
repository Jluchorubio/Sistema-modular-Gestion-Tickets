-- Migration 035: DB cleanup — remove dead tables, empty schemas, stale outbox row
-- Safe to run multiple times (IF EXISTS guards everywhere)

-- ─── 1. Dead tables — 0 rows, never written by backend ───────────────────────

-- Duplicates tickets.ticket_assignments (same data, different source)
DROP TABLE IF EXISTS modules.technician_assignment_log;

-- Duplicates modules.technician_status (availability tracking moved there)
DROP TABLE IF EXISTS tickets.technician_availability;

-- reports.technician_load was created with no columns — placeholder never finished
DROP TABLE IF EXISTS reports.technician_load;

-- ─── 2. Empty schemas ────────────────────────────────────────────────────────

-- maintenance schema: created early, never populated
DROP SCHEMA IF EXISTS maintenance;

-- reports schema: only had technician_load (now dropped above)
-- Keep reports schema itself — backend reporting.service.ts may use it in future
-- DROP SCHEMA IF EXISTS reports;  ← intentionally commented out

-- ─── 3. Stale events.outbox row ──────────────────────────────────────────────
-- 1 row stuck since 2026-05-24, status='pending', no processor reads this table.
-- generate_approval_token() writes here atomically; outbox is stand-by for RabbitMQ.
-- Clearing only this orphaned row — the table itself stays.
DELETE FROM events.outbox
WHERE status = 'pending'
  AND created_at < now() - INTERVAL '7 days';
