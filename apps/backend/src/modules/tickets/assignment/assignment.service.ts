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
   * Resolves the appropriate technician for a newly created ticket.
   * Inserts a ticket_assignment record and returns the assigned user_id, or
   * null when the module is configured for manual assignment.
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

    let technicianId: string | null = null;

    if (mode === 'round_robin') {
      technicianId = await this.roundRobin.nextTechnician(moduleId);
    } else {
      // hybrid: skill-based with round-robin fallback
      technicianId =
        (await this.skillBased.findBySkill(moduleId, categoryId)) ??
        (await this.roundRobin.nextTechnician(moduleId));
    }

    if (!technicianId) return null;

    await this.db.query(
      `INSERT INTO tickets.ticket_assignments
         (ticket_id, user_id, role, assigned_by, is_active)
       VALUES ($1, $2, 'owner'::assignment_role, $3, true)
       ON CONFLICT DO NOTHING`,
      [ticketId, technicianId, assignedById],
    );

    return technicianId;
  }
}
