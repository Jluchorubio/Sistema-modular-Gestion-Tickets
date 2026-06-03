-- ============================================================
-- Migration 025: Columnas de escalación en tickets.tickets
-- Aplicadas directamente en Railway 2026-06-03 via Node script.
-- Este archivo documenta el cambio para consistencia con SCHEMA_MASTER.
-- IDEMPOTENTE.
-- ============================================================

ALTER TABLE tickets.tickets
  ADD COLUMN IF NOT EXISTS escalated       BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS escalated_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_note TEXT;

-- También registrar la corrección de columnas en SLA evaluator:
-- tickets.sla_rules:    rule_order → sort_order (existía como sort_order)
-- tickets.sla_rules:    resolution_time_hours → hours_to_resolve (existía como hours_to_resolve)
-- tickets.sla_conditions: order_index → sort_order (existía como sort_order)
-- Código corregido en sla-evaluator.service.ts para usar nombres correctos.
