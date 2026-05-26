import { DataSource } from 'typeorm';

interface RoutingResult {
  assignedTo:  string | null;  // user ID of admin to assign, null = superadmin queue
  autoEscalated: boolean;
}

/**
 * Finds the appropriate assignee for a new request.
 * If module_id is in metadata, looks for that module's admin.
 * If no admin found → auto-escalate to superadmin queue (assignedTo=null).
 */
export async function resolveAssignee(
  db:       DataSource,
  metadata: Record<string, unknown> | null,
): Promise<RoutingResult> {
  const moduleId = metadata?.module_id as string | undefined;
  if (!moduleId) return { assignedTo: null, autoEscalated: false };

  // Find an active admin of this module (role with is_admin=TRUE)
  const [admin] = await db.query<{ user_id: string }[]>(
    `SELECT umr.user_id
     FROM modules.user_module_roles umr
     JOIN modules.module_roles      mr  ON mr.id = umr.role_id
     WHERE umr.module_id = $1
       AND umr.is_active  = TRUE
       AND mr.is_admin    = TRUE
       AND mr.is_active   = TRUE
     LIMIT 1`,
    [moduleId],
  );

  if (admin) return { assignedTo: admin.user_id, autoEscalated: false };

  // No admin found → escalate to superadmin queue
  return { assignedTo: null, autoEscalated: true };
}

