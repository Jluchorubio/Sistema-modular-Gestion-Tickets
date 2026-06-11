-- Migration 009: Align sla_rules + sla_conditions columns with backend service
-- Apply: psql $DATABASE_URL -f migrations/009_sla_rules_schema_fix.sql
--
-- Problem: SCHEMA_MASTER created tickets.sla_rules with columns:
--   resolution_time_hours, rule_order  (no name, no is_active)
-- and tickets.sla_conditions with:
--   order_index  (not sort_order)
-- The backend service queries/inserts with the new names. Fix: rename columns, add missing ones.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. tickets.sla_rules — rename + add columns
-- ---------------------------------------------------------------------------
ALTER TABLE tickets.sla_rules
    RENAME COLUMN resolution_time_hours TO hours_to_resolve;

ALTER TABLE tickets.sla_rules
    RENAME COLUMN rule_order TO sort_order;

ALTER TABLE tickets.sla_rules
    ADD COLUMN IF NOT EXISTS name      varchar(150) NOT NULL DEFAULT 'Regla SLA',
    ADD COLUMN IF NOT EXISTS is_active boolean      NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. tickets.sla_conditions — rename column
-- ---------------------------------------------------------------------------
ALTER TABLE tickets.sla_conditions
    RENAME COLUMN order_index TO sort_order;

COMMIT;

-- VERIFY
-- \d tickets.sla_rules
-- \d tickets.sla_conditions
-- SELECT id, name, priority_result, hours_to_resolve, sort_order, is_active FROM tickets.sla_rules LIMIT 5;
-- SELECT id, rule_id, field, operator, value, logical_group, sort_order FROM tickets.sla_conditions LIMIT 5;
