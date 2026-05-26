-- Migration: ticket_attachments table
-- Apply on Railway with: psql $DATABASE_URL -f migrations/001_ticket_attachments.sql

CREATE TABLE IF NOT EXISTS tickets.ticket_attachments (
    id            uuid         NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    ticket_id     uuid         NOT NULL,
    uploaded_by   uuid         NOT NULL,
    original_name varchar(255) NOT NULL,
    stored_name   varchar(255) NOT NULL,
    mime_type     varchar(100) NOT NULL,
    file_size     bigint       NOT NULL DEFAULT 0,
    file_url      text         NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    deleted_at    timestamptz,
    -- FK to partitioned tickets.tickets omitted (partition key prevents single-col FK)
    CONSTRAINT fk_ta_user FOREIGN KEY (uploaded_by)
        REFERENCES users.profiles(id)
);

CREATE INDEX IF NOT EXISTS idx_ta_ticket_active
    ON tickets.ticket_attachments(ticket_id)
    WHERE deleted_at IS NULL;
