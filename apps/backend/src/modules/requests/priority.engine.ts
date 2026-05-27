import { DataSource } from 'typeorm';

type Priority = 'baja' | 'media' | 'alta' | 'critica';

interface PriorityResult {
  priority: Priority;
  auto:     boolean;
  score?:   number;
}

// Same formula coefficients as tickets engine
const W_CARGO = 0.25;
const W_NODO  = 0.35;

function scoreToP(score: number): Priority {
  if (score >= 9) return 'critica';
  if (score >= 7) return 'alta';
  if (score >= 5) return 'media';
  return 'baja';
}

/**
 * Calculates request priority.
 * 1. 'other' type → respect manual if provided
 * 2. Rule exists in config.priority_rules:
 *    - if rule has position_level_min: check requester's position node weight for elevation
 *    - else use rule's base_priority
 * 3. No rule → score-based using requester's cargo/nodo weights + neutral damage weight
 */
export async function calculatePriority(
  db:              DataSource,
  requestType:     string,
  requesterId:     string,
  manualPriority?: string,
): Promise<PriorityResult> {
  if (requestType === 'other' && manualPriority) {
    return { priority: manualPriority as Priority, auto: false };
  }

  // Lookup rule
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

  if (rule) {
    if (rule.position_level_min !== null && rule.elevated_priority) {
      const cargoWeight = await loadCargoWeight(db, requesterId);
      // Map weight 1-10 → level-equivalent: weight ≥ position_level_min triggers elevation
      if (cargoWeight >= rule.position_level_min) {
        return { priority: rule.elevated_priority as Priority, auto: true };
      }
    }
    return { priority: rule.base_priority as Priority, auto: true };
  }

  // No rule → compute score from requester's org weights (neutral damage weight = 5)
  const [cargoWeight, nodoWeight] = await Promise.all([
    loadCargoWeight(db, requesterId),
    loadNodoWeight(db, requesterId),
  ]);

  const score = cargoWeight * W_CARGO + nodoWeight * W_NODO + 5 * (1 - W_CARGO - W_NODO);
  return { priority: scoreToP(score), auto: true, score };
}

async function loadCargoWeight(db: DataSource, userId: string): Promise<number> {
  const [row] = await db.query<{ weight: number | null }[]>(
    `SELECT n.weight
     FROM users.profiles p
     LEFT JOIN org.nodes n ON n.id = p.position_node_id AND n.is_active = TRUE
     WHERE p.id = $1`,
    [userId],
  );
  return row?.weight ?? 5;
}

async function loadNodoWeight(db: DataSource, userId: string): Promise<number> {
  const [row] = await db.query<{ weight: number | null }[]>(
    `SELECT n.weight
     FROM users.profiles p
     JOIN org.nodes n ON n.id = p.org_node_id AND n.is_active = TRUE
     WHERE p.id = $1`,
    [userId],
  );
  return row?.weight ?? 5;
}
