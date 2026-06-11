-- Migration 043: Add FK constraint for requests.admin_requests.assigned_to
-- Ensures referential integrity: assigned_to always points to a real profile
-- ON DELETE SET NULL preserves request history when user is deleted

-- Clean up any orphaned assigned_to values before adding constraint
UPDATE requests.admin_requests
SET assigned_to = NULL
WHERE assigned_to IS NOT NULL
  AND assigned_to NOT IN (SELECT id FROM users.profiles);

ALTER TABLE requests.admin_requests
  ADD CONSTRAINT fk_admin_requests_assigned_to
  FOREIGN KEY (assigned_to)
  REFERENCES users.profiles(id)
  ON DELETE SET NULL;
