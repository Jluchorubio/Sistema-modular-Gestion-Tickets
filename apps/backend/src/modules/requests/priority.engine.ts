import { DataSource } from 'typeorm';

type Priority = 'baja' | 'media' | 'alta' | 'critica';

interface PriorityResult {
  priority: Priority;
  auto:     boolean;
  score?:   number;
}

interface FormulaConfig {
  w_cargo:           number;
  w_nodo:            number;
  w_daño:            number;
  threshold_critica: number;
  threshold_alta:    number;
  threshold_media:   number;
}

const FORMULA_DEFAULTS: FormulaConfig = {
  w_cargo: 0.25, w_nodo: 0.35, w_daño: 0.40,
  threshold_critica: 9, threshold_alta: 7, threshold_media: 5,
};

let formulaCache: FormulaConfig | null = null;
let formulaCacheAt = 0;
const CACHE_TTL = 60_000;

async function loadFormula(db: DataSource): Promise<FormulaConfig> {
  if (formulaCache && Date.now() - formulaCacheAt < CACHE_TTL) return formulaCache;
  try {
    const [row] = await db.query(
      `SELECT w_cargo, w_nodo, w_daño,
              threshold_critica, threshold_alta, threshold_media
       FROM config.priority_formula WHERE is_active = TRUE LIMIT 1`,
    ) as any[];
    formulaCache = row
      ? {
          w_cargo: +row.w_cargo, w_nodo: +row.w_nodo, w_daño: +row.w_daño,
          threshold_critica: +row.threshold_critica,
          threshold_alta:    +row.threshold_alta,
          threshold_media:   +row.threshold_media,
        }
      : FORMULA_DEFAULTS;
  } catch { formulaCache = FORMULA_DEFAULTS; }
  formulaCacheAt = Date.now();
  return formulaCache;
}

function scoreToP(score: number, f: FormulaConfig): Priority {
  if (score >= f.threshold_critica) return 'critica';
  if (score >= f.threshold_alta)    return 'alta';
  if (score >= f.threshold_media)   return 'media';
  return 'baja';
}

/**
 * Calculates request priority using the SAME formula as tickets.
 * 1. 'other' type → respect manual if provided
 * 2. Rule exists in config.priority_rules:
 *    - if rule has position_level_min: check requester cargo weight for elevation
 *    - else use rule's base_priority
 * 3. No rule → full score: cargo + nodo + damage_type weights from config.priority_formula
 */
export async function calculatePriority(
  db:              DataSource,
  requestType:     string,
  requesterId:     string,
  manualPriority?: string,
  damageTypeId?:   string | null,
): Promise<PriorityResult> {
  if (requestType === 'other' && manualPriority) {
    return { priority: manualPriority as Priority, auto: false };
  }

  // Rule-based lookup
  const [rule] = await db.query(
    `SELECT base_priority, position_level_min, elevated_priority
     FROM config.priority_rules
     WHERE request_type = $1 AND is_active = TRUE
     LIMIT 1`,
    [requestType],
  ) as any[];

  if (rule) {
    if (rule.position_level_min !== null && rule.elevated_priority) {
      const cargoWeight = await loadCargoWeight(db, requesterId);
      if (cargoWeight >= rule.position_level_min) {
        return { priority: rule.elevated_priority as Priority, auto: true };
      }
    }
    return { priority: rule.base_priority as Priority, auto: true };
  }

  // No rule → score-based, identical formula to PriorityEngineService
  const [cargoWeight, nodoWeight, damageWeight, formula] = await Promise.all([
    loadCargoWeight(db, requesterId),
    loadNodoWeight(db, requesterId),
    loadDamageWeight(db, damageTypeId ?? null),
    loadFormula(db),
  ]);

  const score = cargoWeight * formula.w_cargo
              + nodoWeight  * formula.w_nodo
              + damageWeight * formula.w_daño;

  return { priority: scoreToP(score, formula), auto: true, score };
}

async function loadCargoWeight(db: DataSource, userId: string): Promise<number> {
  const [row] = await db.query(
    `SELECT n.weight
     FROM users.profiles p
     LEFT JOIN org.nodes n ON n.id = p.position_node_id AND n.is_active = TRUE
     WHERE p.id = $1`,
    [userId],
  ) as any[];
  return +(row?.weight ?? 1);
}

async function loadNodoWeight(db: DataSource, userId: string): Promise<number> {
  const [row] = await db.query(
    `SELECT n.weight
     FROM users.profiles p
     JOIN org.nodes n ON n.id = p.org_node_id AND n.is_active = TRUE
     WHERE p.id = $1`,
    [userId],
  ) as any[];
  return +(row?.weight ?? 1);
}

async function loadDamageWeight(db: DataSource, damageTypeId: string | null): Promise<number> {
  if (!damageTypeId) return 1;
  const [row] = await db.query(
    `SELECT weight FROM tickets.damage_types WHERE id = $1 AND is_active = TRUE LIMIT 1`,
    [damageTypeId],
  ) as any[];
  return +(row?.weight ?? 1);
}
