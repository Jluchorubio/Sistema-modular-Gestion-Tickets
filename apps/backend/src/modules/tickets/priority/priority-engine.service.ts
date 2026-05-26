import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface PriorityContext {
  damage_type_id?: string;
  urgency?:        string;
  impact?:         string;
  creator_id?:     string;
}

export interface PriorityResult {
  priority: string;
  score:    number;
  signals:  {
    weight:         number;
    urgency_bonus:  number;
    impact_bonus:   number;
    position_bonus: number;
  };
}

const URGENCY_BONUS: Record<string, number> = {
  urgente: 3, alta: 2, media: 1, baja: 0,
};

const IMPACT_BONUS: Record<string, number> = {
  critico: 4, alto: 2, medio: 1, bajo: 0,
};

function scoreToP(score: number): string {
  if (score >= 15) return 'critica';
  if (score >= 10) return 'alta';
  if (score >= 6)  return 'media';
  return 'baja';
}

@Injectable()
export class PriorityEngineService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async compute(ctx: PriorityContext): Promise<PriorityResult> {
    const [weight, positionBonus] = await Promise.all([
      this.loadDamageWeight(ctx.damage_type_id),
      this.loadPositionBonus(ctx.creator_id),
    ]);

    const urgencyBonus  = URGENCY_BONUS[ctx.urgency  ?? 'media'] ?? 1;
    const impactBonus   = IMPACT_BONUS [ctx.impact   ?? 'medio'] ?? 1;
    const score         = weight + urgencyBonus + impactBonus + positionBonus;

    return {
      priority: scoreToP(score),
      score,
      signals: {
        weight,
        urgency_bonus:  urgencyBonus,
        impact_bonus:   impactBonus,
        position_bonus: positionBonus,
      },
    };
  }

  /* ── Recurrence detection: same asset + damage_type in last 30 days ── */

  async checkRecurrence(assetId: string, damageTypeId: string): Promise<number> {
    const [row] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*) AS cnt
       FROM tickets.tickets
       WHERE asset_id      = $1
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

  /* ── Returns damage_type.weight, or 5 (neutral mid-point) if unknown ── */
  private async loadDamageWeight(damageTypeId?: string): Promise<number> {
    if (!damageTypeId) return 5;
    const [row] = await this.db.query<{ weight: number }[]>(
      `SELECT weight FROM tickets.damage_types WHERE id = $1 AND is_active = TRUE`,
      [damageTypeId],
    );
    return row?.weight ?? 5;
  }

  /* ── Returns position-level bonus for the creator ── */
  private async loadPositionBonus(creatorId?: string): Promise<number> {
    if (!creatorId) return 0;
    const [row] = await this.db.query<{ level: number }[]>(
      `SELECT pos.level
       FROM users.profiles p
       JOIN org.positions pos ON pos.id = p.position_id
       WHERE p.id = $1 AND pos.is_active = TRUE`,
      [creatorId],
    );
    if (!row) return 0;
    if (row.level <= 2) return 3;
    if (row.level <= 4) return 1;
    return 0;
  }
}
