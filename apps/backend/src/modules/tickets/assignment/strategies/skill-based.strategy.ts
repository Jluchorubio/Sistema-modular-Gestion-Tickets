import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Specialization-based selection.
 *
 * A technician is "specialized" for a ticket when an explicit admin-managed
 * record exists in modules.technician_specializations for that
 * (user, module, damage_type | category) combination.
 *
 * Workload balancing is applied within the matching set:
 *   Primary:   fewest open tickets (fair distribution)
 *   Secondary: longest since last assignment (tie-breaker)
 */
@Injectable()
export class SkillBasedStrategy {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /**
   * Returns IDs of all active technicians in the module that are specialized
   * for this ticket (damage_type OR category match).  No locking — caller
   * runs this outside the transaction.
   */
  async findSpecialistIds(
    moduleId:     string,
    damageTypeId: string | null,
    categoryId:   string | null,
  ): Promise<string[]> {
    if (!damageTypeId && !categoryId) return [];

    const rows = await this.db.query<{ user_id: string }[]>(
      `SELECT DISTINCT umr.user_id
       FROM modules.user_module_roles  umr
       JOIN modules.module_roles        mr  ON mr.id  = umr.role_id
       JOIN users.profiles              p   ON p.id   = umr.user_id
                                           AND p.deleted_at IS NULL
                                           AND p.is_active  = true
       JOIN modules.technician_specializations ts
                                           ON ts.user_id   = umr.user_id
                                          AND ts.module_id = umr.module_id
                                          AND ts.is_active = true
                                          AND (
                                                ($1::uuid IS NOT NULL AND ts.damage_type_id = $1::uuid)
                                             OR ($2::uuid IS NOT NULL AND ts.category_id    = $2::uuid)
                                          )
       WHERE umr.module_id = $3
         AND mr.name IN ('tecnico', 'jefe_tecnico')
         AND umr.is_active = true`,
      [damageTypeId, categoryId, moduleId],
    );
    return rows.map(r => r.user_id);
  }
}
