import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';
import { SkillBasedStrategy } from './strategies/skill-based.strategy';

@Injectable()
export class AssignmentService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly roundRobin: RoundRobinStrategy,
    private readonly skillBased: SkillBasedStrategy,
  ) {}

  /**
   * Resolves the appropriate technician for a newly created ticket and inserts
   * the assignment record atomically. The round-robin selection uses
   * FOR UPDATE SKIP LOCKED so concurrent ticket creations cannot double-assign
   * the same technician.
   */
  async assign(
    ticketId:     string,
    moduleId:     string,
    categoryId:   string,
    assignedById: string,
  ): Promise<string | null> {
    const [mod] = await this.db.query<{ assignment_mode: string }[]>(
      `SELECT assignment_mode FROM modules.modules WHERE id = $1`,
      [moduleId],
    );
    const mode = mod?.assignment_mode ?? 'manual';
    if (mode === 'manual') return null;

    // skill-based pre-selection (read-only, outside transaction is fine)
    let skillTechId: string | null = null;
    if (mode !== 'round_robin') {
      skillTechId = await this.skillBased.findBySkill(moduleId, categoryId);
    }

    const qr = this.db.createQueryRunner();
    await qr.connect();
    await qr.startTransaction();
    try {
      let technicianId: string | null = null;

      if (skillTechId) {
        // Lock the specific tech row for this transaction
        const lockedRows = await qr.query(
          `SELECT umr.user_id
           FROM modules.user_module_roles umr
           JOIN users.profiles p ON p.id = umr.user_id AND p.deleted_at IS NULL AND p.is_active = true
           WHERE umr.user_id   = $1
             AND umr.module_id = $2
             AND umr.is_active = true
           FOR UPDATE OF umr SKIP LOCKED`,
          [skillTechId, moduleId],
        ) as { user_id: string }[];
        technicianId = lockedRows[0]?.user_id ?? null;
      }

      // Round-robin with workload balancing:
      // Primary sort: fewest open (non-final) tickets → ensures even distribution.
      // Secondary sort: longest since last assignment (NULLS FIRST) → tie-breaker for equal load.
      if (!technicianId) {
        const rrRows = await qr.query(
          `SELECT umr.user_id
           FROM modules.user_module_roles umr
           JOIN modules.module_roles mr ON mr.id = umr.role_id
           JOIN users.profiles        p  ON p.id = umr.user_id AND p.deleted_at IS NULL AND p.is_active = true
           WHERE umr.module_id = $1
             AND mr.name       IN ('tecnico', 'jefe_tecnico')
             AND umr.is_active = true
           ORDER BY (
             SELECT COUNT(*)
             FROM   tickets.ticket_assignments ta
             JOIN   tickets.tickets t2 ON t2.id = ta.ticket_id AND t2.deleted_at IS NULL
             JOIN   tickets.states  s  ON s.id  = t2.current_state_id AND s.is_final = FALSE
             WHERE  ta.user_id   = umr.user_id
               AND  ta.role      = 'owner'
               AND  ta.is_active = TRUE
           ) ASC,
           (
             SELECT MAX(ta.assigned_at)
             FROM   tickets.ticket_assignments ta
             WHERE  ta.user_id = umr.user_id
               AND  ta.role    = 'owner'
           ) ASC NULLS FIRST
           LIMIT 1
           FOR UPDATE OF umr SKIP LOCKED`,
          [moduleId],
        ) as { user_id: string }[];
        technicianId = rrRows[0]?.user_id ?? null;
      }

      if (!technicianId) {
        await qr.rollbackTransaction();
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
}
