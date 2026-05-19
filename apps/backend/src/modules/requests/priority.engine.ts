import { DataSource } from 'typeorm';

type Priority = 'baja' | 'media' | 'alta' | 'critica';

interface PriorityResult {
  priority:     Priority;
  auto:         boolean;
}

/**
 * Calculates request priority from DB rules.
 * Falls back to 'media' if no rule found.
 * Only 'other' type allows manual override.
 */
export async function calculatePriority(
  db:           DataSource,
  requestType:  string,
  requesterId:  string,
  manualPriority?: string,
): Promise<PriorityResult> {
  // 'other' type: respect manual if provided
  if (requestType === 'other' && manualPriority) {
    return { priority: manualPriority as Priority, auto: false };
  }

  // Look up rule for this request type
  const [rule] = await db.query<{
    base_priority:      string;
    position_level_min: number | null;
    elevated_priority:  string | null;
  }[]>(
    `SELECT base_priority, position_level_min, elevated_priority
     FROM config.priority_rules
     WHERE request_type = $1 AND is_active = TRUE
     LIMIT 1`,
    [requestType],
  );

  if (!rule) return { priority: 'media', auto: true };

  // If rule has position-level elevation, look up requester's position level
  if (rule.position_level_min !== null && rule.elevated_priority) {
    const [profile] = await db.query<{ level: number | null }[]>(
      `SELECT op.level
       FROM users.profiles p
       LEFT JOIN org.positions op ON op.id = p.position_id
       WHERE p.id = $1`,
      [requesterId],
    );
    const level = profile?.level ?? 0;
    if (level >= rule.position_level_min) {
      return { priority: rule.elevated_priority as Priority, auto: true };
    }
  }

  return { priority: rule.base_priority as Priority, auto: true };
}
