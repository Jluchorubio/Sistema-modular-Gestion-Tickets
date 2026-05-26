import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class RoundRobinStrategy {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async nextTechnician(moduleId: string): Promise<string | null> {
    const [row] = await this.db.query<{ user_id: string }[]>(
      `SELECT umr.user_id,
         (SELECT COUNT(*)
          FROM   tickets.ticket_assignments ta
          JOIN   tickets.tickets            tk ON tk.id  = ta.ticket_id
          JOIN   tickets.states             st ON st.id  = tk.current_state_id
          WHERE  ta.user_id   = umr.user_id
            AND  ta.role      = 'owner'
            AND  ta.is_active = true
            AND  st.is_final  = false
            AND  tk.deleted_at IS NULL
         ) AS open_count
       FROM  modules.user_module_roles umr
       JOIN  modules.module_roles      mr  ON mr.id = umr.role_id
       WHERE umr.module_id = $1
         AND mr.name       IN ('tecnico', 'jefe_tecnico')
         AND umr.is_active = true
       ORDER BY open_count ASC
       LIMIT 1`,
      [moduleId],
    );
    return row?.user_id ?? null;
  }
}
