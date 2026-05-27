import { Injectable } from '@nestjs/common';
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
  threshold_critica: 9, threshold_alta: 7, threshold_media: 5,
};

const URGENCY_BONUS: Record<string, number> = {
  urgente: 1.5, alta: 1.0, media: 0.5, baja: 0,
};
const IMPACT_BONUS: Record<string, number> = {
  critico: 1.5, alto: 1.0, medio: 0.5, bajo: 0,
};

@Injectable()
export class PriorityEngineService {
  private formulaCache: FormulaConfig | null = null;
  private formulaCacheAt = 0;
  private readonly CACHE_TTL = 60_000; // 1 min

  constructor(@InjectDataSource() private readonly db: DataSource) {}

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

  async compute(ctx: PriorityContext): Promise<PriorityResult> {
    const [formula, pesoCargo, pesoNodo, pesoDaño] = await Promise.all([
      this.getFormula(),
      this.loadCargoWeight(ctx.creator_id),
      this.loadNodoWeight(ctx.creator_id),
      this.loadDamageWeight(ctx.damage_type_id),
    ]);

    const urgencyBonus = URGENCY_BONUS[ctx.urgency ?? 'media'] ?? 0.5;
    const impactBonus  = IMPACT_BONUS [ctx.impact  ?? 'medio'] ?? 0.5;

    const baseScore = pesoCargo * formula.w_cargo + pesoNodo * formula.w_nodo + pesoDaño * formula.w_daño;
    const score     = baseScore + urgencyBonus + impactBonus;

    const priority =
      score >= formula.threshold_critica ? 'critica' :
      score >= formula.threshold_alta    ? 'alta'    :
      score >= formula.threshold_media   ? 'media'   : 'baja';

    return {
      priority,
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
    const order = ['baja', 'media', 'alta', 'critica'];
    const idx = order.indexOf(current);
    return idx < order.length - 1 ? order[idx + 1] : current;
  }

  // peso_daño: damage_type.weight (1-10), fallback neutral 5
  private async loadDamageWeight(damageTypeId?: string): Promise<number> {
    if (!damageTypeId) return 5;
    const [row] = await this.db.query<{ weight: number }[]>(
      `SELECT weight FROM tickets.damage_types WHERE id = $1 AND is_active = TRUE`,
      [damageTypeId],
    );
    return row?.weight ?? 5;
  }

  // peso_cargo: weight of user's position node (org.nodes) via position_node_id, fallback neutral 5
  private async loadCargoWeight(creatorId?: string): Promise<number> {
    if (!creatorId) return 5;
    const [row] = await this.db.query<{ weight: number | null }[]>(
      `SELECT n.weight
       FROM users.profiles p
       LEFT JOIN org.nodes n ON n.id = p.position_node_id AND n.is_active = TRUE
       WHERE p.id = $1`,
      [creatorId],
    );
    return row?.weight ?? 5;
  }

  // peso_nodo: weight of user's deepest org node (sede/depto/area) via org_node_id
  // fallback: neutral 5
  private async loadNodoWeight(creatorId?: string): Promise<number> {
    if (!creatorId) return 5;
    const [row] = await this.db.query<{ weight: number | null }[]>(
      `SELECT n.weight
       FROM users.profiles p
       JOIN org.nodes n ON n.id = p.org_node_id AND n.is_active = TRUE
       WHERE p.id = $1`,
      [creatorId],
    );
    return row?.weight ?? 5;
  }
}
