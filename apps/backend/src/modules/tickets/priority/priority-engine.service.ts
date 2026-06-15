import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface PriorityContext {
  damage_type_id?: string;
  urgency?:        string;
  impact?:         string;
  creator_id?:     string;
}

export interface PrioritySignals {
  peso_cargo:     number;
  peso_nodo:      number;
  peso_daño:      number;
  urgency_bonus:  number;
  impact_bonus:   number;
  base_score:     number;
}

export interface PriorityResult {
  priority: string;
  score:    number;
  signals:  PrioritySignals;
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
  // Raised to 11: prevents average users from reaching CRITICA via urgency/impact alone.
  // Max score ≈ 13 (all weights=10 + max bonuses). CRITICA requires high org weight + severe damage.
  threshold_critica: 11, threshold_alta: 7, threshold_media: 5,
};

// Fallbacks en caso de fallo de DB — mismos valores que antes de la migración 044
const DEFAULT_PRIORITY_ORDER  = ['baja', 'media', 'alta', 'critica'];
const DEFAULT_URGENCY_BONUS: Record<string, number> = { urgente: 1.5, alta: 1.0, media: 0.5, baja: 0 };
const DEFAULT_IMPACT_BONUS:  Record<string, number> = { critico: 1.5, alto: 1.0, medio: 0.5, bajo: 0 };

@Injectable()
export class PriorityEngineService implements OnModuleInit {
  // Formula cache
  private formulaCache: FormulaConfig | null = null;
  private formulaCacheAt = 0;

  // Levels cache (priority_levels, urgency_levels, impact_levels)
  private priorityOrder:   string[]              = DEFAULT_PRIORITY_ORDER;
  private urgencyBonusMap: Record<string, number> = DEFAULT_URGENCY_BONUS;
  private impactBonusMap:  Record<string, number> = DEFAULT_IMPACT_BONUS;
  private levelsCacheAt = 0;

  private readonly CACHE_TTL = 60_000; // 1 min

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async onModuleInit() {
    await this.refreshLevels();
  }

  /* ── Formula cache ─────────────────────────────────────────────── */

  private async getFormula(): Promise<FormulaConfig> {
    if (this.formulaCache && Date.now() - this.formulaCacheAt < this.CACHE_TTL) {
      return this.formulaCache;
    }
    const [row] = await this.db.query<any[]>(
      `SELECT w_cargo, w_nodo, w_daño, threshold_critica, threshold_alta, threshold_media
       FROM config.priority_formula WHERE is_active = TRUE LIMIT 1`,
    );
    this.formulaCache  = row
      ? { w_cargo: +row.w_cargo, w_nodo: +row.w_nodo, w_daño: +row.w_daño,
          threshold_critica: +row.threshold_critica, threshold_alta: +row.threshold_alta,
          threshold_media: +row.threshold_media }
      : FORMULA_DEFAULTS;
    this.formulaCacheAt = Date.now();
    return this.formulaCache;
  }

  invalidateFormulaCache() { this.formulaCache = null; }

  /* ── Levels cache (priority / urgency / impact) ─────────────────── */

  private async refreshLevels(): Promise<void> {
    try {
      const [priorities, urgencies, impacts] = await Promise.all([
        this.db.query<{ slug: string; sort_order: number }[]>(
          `SELECT slug, sort_order FROM config.priority_levels WHERE is_active = TRUE ORDER BY sort_order`,
        ),
        this.db.query<{ slug: string; bonus: string }[]>(
          `SELECT slug, bonus FROM config.urgency_levels WHERE is_active = TRUE ORDER BY sort_order`,
        ),
        this.db.query<{ slug: string; bonus: string }[]>(
          `SELECT slug, bonus FROM config.impact_levels WHERE is_active = TRUE ORDER BY sort_order`,
        ),
      ]);
      if (priorities.length) this.priorityOrder   = priorities.map(r => r.slug);
      if (urgencies.length)  this.urgencyBonusMap = Object.fromEntries(urgencies.map(r => [r.slug, +r.bonus]));
      if (impacts.length)    this.impactBonusMap  = Object.fromEntries(impacts.map(r => [r.slug, +r.bonus]));
      this.levelsCacheAt = Date.now();
    } catch {
      // keep existing defaults — DB unreachable
    }
  }

  private async ensureLevels(): Promise<void> {
    if (Date.now() - this.levelsCacheAt > this.CACHE_TTL) {
      await this.refreshLevels();
    }
  }

  invalidateLevelsCache() { this.levelsCacheAt = 0; }

  /* ── Public API ────────────────────────────────────────────────── */

  async compute(ctx: PriorityContext): Promise<PriorityResult> {
    const [formula] = await Promise.all([
      this.getFormula(),
      this.ensureLevels(),
    ]);

    const [pesoCargo, pesoNodo, pesoDaño] = await Promise.all([
      this.loadCargoWeight(ctx.creator_id),
      this.loadNodoWeight(ctx.creator_id),
      this.loadDamageWeight(ctx.damage_type_id),
    ]);

    const defaultUrgency = this.priorityOrder.length > 1
      ? this.priorityOrder[Math.floor(this.priorityOrder.length / 2) - 1]
      : 'media';
    const defaultImpact = defaultUrgency;

    const urgencyBonus = this.urgencyBonusMap[ctx.urgency ?? defaultUrgency] ?? 0.5;
    const impactBonus  = this.impactBonusMap [ctx.impact  ?? defaultImpact]  ?? 0.5;

    const baseScore = pesoCargo * formula.w_cargo + pesoNodo * formula.w_nodo + pesoDaño * formula.w_daño;
    const score     = baseScore + urgencyBonus + impactBonus;

    const priority =
      score >= formula.threshold_critica ? this.priorityOrder[this.priorityOrder.length - 1] :
      score >= formula.threshold_alta    ? this.priorityOrder[this.priorityOrder.length - 2] :
      score >= formula.threshold_media   ? this.priorityOrder[this.priorityOrder.length - 3] :
                                           this.priorityOrder[0];

    return {
      priority: priority ?? 'baja',
      score:    Math.round(score * 100) / 100,
      signals: {
        peso_cargo:    pesoCargo,
        peso_nodo:     pesoNodo,
        peso_daño:     pesoDaño,
        urgency_bonus: urgencyBonus,
        impact_bonus:  impactBonus,
        base_score:    Math.round(baseScore * 100) / 100,
      },
    };
  }

  async checkRecurrence(assetId: string, damageTypeId: string): Promise<number> {
    const [row] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*) AS cnt
       FROM tickets.tickets
       WHERE asset_id       = $1
         AND damage_type_id = $2
         AND created_at    >= now() - INTERVAL '30 days'
         AND deleted_at    IS NULL`,
      [assetId, damageTypeId],
    );
    return parseInt(row?.cnt ?? '0', 10);
  }

  escalatePriority(current: string): string {
    const idx = this.priorityOrder.indexOf(current);
    if (idx === -1) return current;
    return idx < this.priorityOrder.length - 1 ? this.priorityOrder[idx + 1] : current;
  }

  getPriorityOrder(): string[] { return [...this.priorityOrder]; }

  /* ── Private weight loaders ────────────────────────────────────── */

  // peso_daño: damage_type.weight (1-10). No damage selected → 0 (no contribution).
  private async loadDamageWeight(damageTypeId?: string): Promise<number> {
    if (!damageTypeId) return 0;
    const [row] = await this.db.query<{ weight: number }[]>(
      `SELECT weight FROM tickets.damage_types WHERE id = $1 AND is_active = TRUE`,
      [damageTypeId],
    );
    return row?.weight ?? 5;
  }

  // peso_cargo: weight of user's position node. Defaults to 1 if not assigned.
  private async loadCargoWeight(creatorId?: string): Promise<number> {
    if (!creatorId) return 1;
    const [row] = await this.db.query<{ weight: number | null }[]>(
      `SELECT n.weight
       FROM users.profiles p
       LEFT JOIN org.nodes n ON n.id = p.position_node_id AND n.is_active = TRUE
       WHERE p.id = $1`,
      [creatorId],
    );
    return row?.weight ?? 1;
  }

  // peso_nodo: weight of user's org node. Defaults to 1 if not assigned.
  private async loadNodoWeight(creatorId?: string): Promise<number> {
    if (!creatorId) return 1;
    const [row] = await this.db.query<{ weight: number | null }[]>(
      `SELECT n.weight
       FROM users.profiles p
       JOIN org.nodes n ON n.id = p.org_node_id AND n.is_active = TRUE
       WHERE p.id = $1`,
      [creatorId],
    );
    return row?.weight ?? 1;
  }
}
