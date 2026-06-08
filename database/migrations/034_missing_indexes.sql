-- Migration 034: indexes faltantes detectados en auditoría
-- inventory.assets.parent_asset_id  →  jerarquía CMDB y decommission unlink
-- tickets.tickets.sla_policy_id     →  SLA evaluator queries
-- ticket_attachments.uploaded_by    →  reporting / user activity
-- knowledge_posts.created_by/updated_by → knowledge search

CREATE INDEX IF NOT EXISTS idx_assets_parent_asset_id
  ON inventory.assets(parent_asset_id);

CREATE INDEX IF NOT EXISTS idx_tickets_sla_policy_id
  ON tickets.tickets(sla_policy_id)
  WHERE sla_policy_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ticket_attachments_uploaded_by
  ON tickets.ticket_attachments(uploaded_by);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_created_by
  ON tickets.knowledge_posts(created_by);

CREATE INDEX IF NOT EXISTS idx_knowledge_posts_updated_by
  ON tickets.knowledge_posts(updated_by)
  WHERE updated_by IS NOT NULL;
