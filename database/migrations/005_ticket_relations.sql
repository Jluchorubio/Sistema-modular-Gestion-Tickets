-- Migration: ticket_relations table
-- Apply on Railway with: psql $DATABASE_URL -f migrations/005_ticket_relations.sql
-- Note: tickets.tickets is partitioned so FK references are omitted for source/target

CREATE TABLE IF NOT EXISTS tickets.ticket_relations (
    id               uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    source_ticket_id uuid        NOT NULL,
    target_ticket_id uuid        NOT NULL,
    relation_type    text        NOT NULL DEFAULT 'related',
    notes            text,
    created_by       uuid        NOT NULL,
    created_at       timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT fk_tr_creator FOREIGN KEY (created_by) REFERENCES users.profiles(id),
    CONSTRAINT chk_tr_no_self CHECK (source_ticket_id <> target_ticket_id),
    CONSTRAINT chk_tr_type CHECK (relation_type IN ('related','duplicate','blocks','caused_by')),
    CONSTRAINT uq_tr_pair UNIQUE (source_ticket_id, target_ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_tr_source ON tickets.ticket_relations (source_ticket_id);
CREATE INDEX IF NOT EXISTS idx_tr_target ON tickets.ticket_relations (target_ticket_id);
