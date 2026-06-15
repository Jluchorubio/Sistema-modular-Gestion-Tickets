import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class RoundRobinStrategy {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async nextTechnician(moduleId: string): Promise<string | null> {
    const [row] = await this.db.query<{ user_id: string }[]>(
      `SELECT umr.user_id
       FROM  modules.user_module_roles umr
       JOIN  modules.module_roles      mr  ON mr.id = umr.role_id
       JOIN  users.profiles            p   ON p.id  = umr.user_id AND p.deleted_at IS NULL AND p.is_active = true
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
       LIMIT 1`,
      [moduleId],
    );
    return row?.user_id ?? null;
  }
}
