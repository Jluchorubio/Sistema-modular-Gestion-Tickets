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

/**
 * Returns SLA deadline (timestamp) based on priority and request type.
 * Falls back to generic rule if no type-specific rule.
 */
export async function resolveSlaDeadline(
  db:          DataSource,
  requestType: string,
  priority:    string,
): Promise<Date> {
  // Try type-specific rule first
  const [specific] = await db.query<{ hours_to_resolve: number }[]>(
    `SELECT hours_to_resolve
     FROM config.sla_rules
     WHERE request_type = $1 AND priority = $2 AND is_active = TRUE
     LIMIT 1`,
    [requestType, priority],
  );

  if (specific) {
    return hoursFromNow(specific.hours_to_resolve);
  }

  // Fall back to generic rule (request_type IS NULL)
  const [generic] = await db.query<{ hours_to_resolve: number }[]>(
    `SELECT hours_to_resolve
     FROM config.sla_rules
     WHERE request_type IS NULL AND priority = $1 AND is_active = TRUE
     LIMIT 1`,
    [priority],
  );

  if (generic) return hoursFromNow(generic.hours_to_resolve);

  // Hard fallback: 4h for alta/critica, 24h for media, 72h for baja
  const fallback: Record<string, number> = { critica: 2, alta: 8, media: 24, baja: 72 };
  return hoursFromNow(fallback[priority] ?? 24);
}

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
