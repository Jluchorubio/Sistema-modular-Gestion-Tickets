import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SkillBasedStrategy } from './strategies/skill-based.strategy';

type AssignmentMode =
  | 'manual'
  | 'round_robin'
  | 'round_robin_skill'
  | 'skill_only'
  | 'balanced';

@Injectable()
export class AssignmentService {
  private readonly logger = new Logger(AssignmentService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly skillBased: SkillBasedStrategy,
  ) {}

  /**
   * Resolves the appropriate technician for a newly created ticket and inserts
   * the assignment record atomically.
   *
   * Modes:
   *   manual             → no auto-assignment (returns null)
   *   round_robin        → pure round-robin among all active techs
   *   round_robin_skill  → RR among specialists; fallback to RR among all
   *   skill_only         → RR among specialists only; no fallback (returns null if none)
   *   balanced           → weighted scoring: specialists get 3× boost over workload score
   *
   * The SELECT uses FOR UPDATE SKIP LOCKED to prevent double-assignment when
   * multiple tickets are created concurrently.
   */
  async assign(
    ticketId:     string,
    moduleId:     string,
    categoryId:   string | null,
    damageTypeId: string | null,
    assignedById: string,
  ): Promise<string | null> {
    const [mod] = await this.db.query<{ assignment_mode: AssignmentMode }[]>(
      `SELECT assignment_mode FROM modules.modules WHERE id = $1`,
      [moduleId],
    );
    const mode: AssignmentMode = mod?.assignment_mode ?? 'manual';
    if (mode === 'manual') return null;

    // For skill-aware modes, resolve the specialist set BEFORE the transaction
    // (read-only, no locks needed)
    let specialistIds: string[] = [];
    if (mode !== 'round_robin') {
      specialistIds = await this.skillBased.findSpecialistIds(
        moduleId, damageTypeId, categoryId,
      );
    }

    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      const technicianId = await this.selectTechnician(qr, mode, moduleId, specialistIds);

      if (!technicianId) {
        await qr.rollbackTransaction();
        if (mode === 'skill_only') {
          this.logger.warn(
            `skill_only: no specialist found for ticket ${ticketId} in module ${moduleId}. ` +
            `damage_type=${damageTypeId} category=${categoryId}`,
          );
        }
        return null;
      }

      await qr.query(
        `INSERT INTO tickets.ticket_assignments
           (ticket_id, user_id, role, assigned_by, is_active)
         VALUES ($1, $2, 'owner'::assignment_role, $3, true)
         ON CONFLICT DO NOTHING`,
        [ticketId, technicianId, assignedById],
      );

      await qr.commitTransaction();
      return technicianId;
    } catch (err) {
      await qr.rollbackTransaction();
      throw err;
    } finally {
      await qr.release();
    }
  }

  // ── Private selection logic per mode ─────────────────────────────────────────

  private async selectTechnician(
    qr:           Awaited<ReturnType<DataSource['createQueryRunner']>>,
    mode:         AssignmentMode,
    moduleId:     string,
    specialistIds: string[],
  ): Promise<string | null> {
    switch (mode) {
      case 'round_robin':
        return this.rrQuery(qr, moduleId, null);

      case 'round_robin_skill': {
        if (specialistIds.length > 0) {
          const tech = await this.rrQuery(qr, moduleId, specialistIds);
          if (tech) return tech;
        }
        // Fallback: all techs
        return this.rrQuery(qr, moduleId, null);
      }

      case 'skill_only': {
        if (specialistIds.length === 0) return null;
        return this.rrQuery(qr, moduleId, specialistIds);
      }

      case 'balanced':
        return this.balancedQuery(qr, moduleId, specialistIds);

      default:
        return null;
    }
  }

  /**
   * Round-robin selection with workload balancing.
   *
   *   Primary sort:   fewest open (non-final) tickets  → even distribution
   *   Secondary sort: longest since last assignment    → tie-breaker
   *
   * @param restrictTo  When non-null, limit candidates to this user_id list
   */
  private async rrQuery(
    qr:         Awaited<ReturnType<DataSource['createQueryRunner']>>,
    moduleId:   string,
    restrictTo: string[] | null,
  ): Promise<string | null> {
    const filterClause = restrictTo && restrictTo.length > 0
      ? `AND umr.user_id = ANY($2::uuid[])`
      : '';
    const params: unknown[] = restrictTo && restrictTo.length > 0
      ? [moduleId, restrictTo]
      : [moduleId];

    const rows = await qr.query(
      `SELECT umr.user_id
       FROM modules.user_module_roles umr
       JOIN modules.module_roles mr ON mr.id = umr.role_id
       JOIN users.profiles        p  ON p.id = umr.user_id
                                    AND p.deleted_at IS NULL
                                    AND p.is_active  = true
       WHERE umr.module_id = $1
         AND mr.name IN ('tecnico', 'jefe_tecnico')
         AND umr.is_active = true
         ${filterClause}
       ORDER BY
         (SELECT COUNT(*)
          FROM   tickets.ticket_assignments ta
          JOIN   tickets.tickets t2 ON t2.id = ta.ticket_id AND t2.deleted_at IS NULL
          JOIN   tickets.states  s  ON s.id  = t2.current_state_id AND s.is_final = FALSE
          WHERE  ta.user_id   = umr.user_id
            AND  ta.role      = 'owner'
            AND  ta.is_active = TRUE
         ) ASC,
         (SELECT MAX(ta.assigned_at)
          FROM   tickets.ticket_assignments ta
          WHERE  ta.user_id = umr.user_id
            AND  ta.role    = 'owner'
         ) ASC NULLS FIRST
       LIMIT 1
       FOR UPDATE OF umr SKIP LOCKED`,
      params,
    ) as { user_id: string }[];

    return rows[0]?.user_id ?? null;
  }

  /**
   * Balanced selection: all techs are eligible.
   * Score = specialist_multiplier / (open_tickets + 1)
   *   specialist_multiplier: 3.0 if specialized, 1.0 otherwise
   *
   * Highest score wins. FOR UPDATE SKIP LOCKED still applied.
   */
  private async balancedQuery(
    qr:            Awaited<ReturnType<DataSource['createQueryRunner']>>,
    moduleId:      string,
    specialistIds: string[],
  ): Promise<string | null> {
    const hasSpecialists = specialistIds.length > 0;
    const params: unknown[] = hasSpecialists ? [moduleId, specialistIds] : [moduleId];
    const specialistClause = hasSpecialists
      ? `CASE WHEN umr.user_id = ANY($2::uuid[]) THEN 3.0 ELSE 1.0 END`
      : `1.0`;

    const rows = await qr.query(
      `SELECT umr.user_id
       FROM modules.user_module_roles umr
       JOIN modules.module_roles mr ON mr.id = umr.role_id
       JOIN users.profiles        p  ON p.id = umr.user_id
                                    AND p.deleted_at IS NULL
                                    AND p.is_active  = true
       WHERE umr.module_id = $1
         AND mr.name IN ('tecnico', 'jefe_tecnico')
         AND umr.is_active = true
       ORDER BY (
         ${specialistClause}
         /
         (
           (SELECT COUNT(*)
            FROM   tickets.ticket_assignments ta
            JOIN   tickets.tickets t2 ON t2.id = ta.ticket_id AND t2.deleted_at IS NULL
            JOIN   tickets.states  s  ON s.id  = t2.current_state_id AND s.is_final = FALSE
            WHERE  ta.user_id   = umr.user_id
              AND  ta.role      = 'owner'
              AND  ta.is_active = TRUE
           ) + 1
         )
       ) DESC
       LIMIT 1
       FOR UPDATE OF umr SKIP LOCKED`,
      params,
    ) as { user_id: string }[];

    return rows[0]?.user_id ?? null;
  }
}
