import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AssignRoleDto } from './dto/assign-role.dto';

@Injectable()
export class RoleService {
  private readonly logger = new Logger(RoleService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ─── Roles por módulo ────────────────────────────────────────────────────────

  async getUserRoles(userId: string) {
    await this.assertUserExists(userId);

    return this.db.query<any[]>(
      `SELECT umr.id,
              umr.module_id,
              m.name        AS module_name,
              m.slug        AS module_slug,
              umr.role_id,
              mr.name       AS role_name,
              umr.assigned_at,
              umr.is_active
       FROM   modules.user_module_roles umr
       JOIN   modules.modules           m  ON m.id  = umr.module_id
       JOIN   modules.module_roles      mr ON mr.id = umr.role_id
       WHERE  umr.user_id = $1
       ORDER  BY m.name, mr.name`,
      [userId],
    );
  }

  async assignRole(actorId: string, userId: string, dto: AssignRoleDto) {
    await this.assertUserExists(userId);
    await this.assertModuleExists(dto.module_id);
    await this.assertActorCanManageModule(actorId, dto.module_id);

    const [role] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.module_roles
       WHERE  id = $1 AND module_id = $2 AND is_active = true`,
      [dto.role_id, dto.module_id],
    );
    if (!role) throw new NotFoundException(`Rol ${dto.role_id} no existe en módulo ${dto.module_id}`);

    const [existing] = await this.db.query<{ id: string; is_active: boolean }[]>(
      `SELECT id, is_active FROM modules.user_module_roles
       WHERE  user_id = $1 AND module_id = $2 AND role_id = $3`,
      [userId, dto.module_id, dto.role_id],
    );

    if (existing) {
      if (existing.is_active) throw new ConflictException('Usuario ya tiene ese rol en ese módulo');
      await this.db.query(
        `UPDATE modules.user_module_roles
         SET    is_active = true, assigned_by = $1, assigned_at = now()
         WHERE  id = $2`,
        [actorId, existing.id],
      );
      return this.getUserRoles(userId);
    }

    await this.db.query(
      `INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by)
       VALUES ($1, $2, $3, $4)`,
      [userId, dto.module_id, dto.role_id, actorId],
    );

    this.logger.log(`Rol ${dto.role_id} asignado a usuario ${userId} en módulo ${dto.module_id} por ${actorId}`);
    return this.getUserRoles(userId);
  }

  async removeRole(actorId: string, userId: string, umrId: string) {
    const [umr] = await this.db.query<{ id: string; module_id: string; is_active: boolean }[]>(
      `SELECT id, module_id, is_active FROM modules.user_module_roles
       WHERE  id = $1 AND user_id = $2`,
      [umrId, userId],
    );

    if (!umr) throw new NotFoundException(`Asignación ${umrId} no encontrada para usuario ${userId}`);
    if (!umr.is_active) throw new BadRequestException('Rol ya está inactivo');

    await this.assertActorCanManageModule(actorId, umr.module_id);

    await this.db.query(
      `UPDATE modules.user_module_roles SET is_active = false WHERE id = $1`,
      [umrId],
    );

    this.logger.log(`Rol ${umrId} removido de usuario ${userId} por ${actorId}`);
    return { ok: true, message: 'Rol removido' };
  }

  async getUsersByModule(moduleId: string, limit?: number, offset?: number) {
    await this.assertModuleExists(moduleId);

    const params: unknown[] = [moduleId];
    let limitClause = '';
    if (limit != null) {
      params.push(limit);
      params.push(offset ?? 0);
      limitClause = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    return this.db.query<any[]>(
      `SELECT p.id,
              p.first_name,
              p.last_name,
              p.avatar_url,
              c.email,
              mr.name                                          AS role_name,
              CASE WHEN umr.is_active THEN 'active' ELSE 'inactive' END AS status
       FROM   modules.user_module_roles umr
       JOIN   users.profiles            p   ON p.id    = umr.user_id
       JOIN   auth.credentials          c   ON c.user_id = p.id
       JOIN   modules.module_roles      mr  ON mr.id   = umr.role_id
       WHERE  umr.module_id = $1
         AND  umr.is_active = true
         AND  p.deleted_at  IS NULL
       ORDER  BY p.first_name, p.last_name, mr.name
       ${limitClause}`,
      params,
    );
  }

  // ─── Estadísticas del sistema ────────────────────────────────────────────────

  async getSystemStats() {
    const [userStats] = await this.db.query<{
      total_users: string; active_users: string; inactive_users: string;
    }[]>(`
      SELECT
        COUNT(*)                                        AS total_users,
        COUNT(*) FILTER (WHERE is_active = true)        AS active_users,
        COUNT(*) FILTER (WHERE is_active = false)       AS inactive_users
      FROM users.profiles
      WHERE deleted_at IS NULL
        AND id != '00000000-0000-0000-0000-000000000001'
    `);

    const [moduleStats] = await this.db.query<{
      total_modules: string; active_modules: string; inactive_modules: string;
    }[]>(`
      SELECT
        COUNT(*)                                        AS total_modules,
        COUNT(*) FILTER (WHERE is_active = true)        AS active_modules,
        COUNT(*) FILTER (WHERE is_active = false)       AS inactive_modules
      FROM modules.modules
      WHERE deleted_at IS NULL
    `);

    const [ticketStats] = await this.db.query<{
      total_tickets: string; open_tickets: string;
    }[]>(`
      SELECT
        COUNT(*)                                             AS total_tickets,
        COUNT(*) FILTER (WHERE s.is_final = false)           AS open_tickets
      FROM tickets.tickets t
      JOIN tickets.states s ON s.id = t.current_state_id
    `);

    const [requestStats] = await this.db.query<{
      total_requests: string; pending_requests: string; in_progress_requests: string;
    }[]>(`
      SELECT
        COUNT(*)                                                                        AS total_requests,
        COUNT(*) FILTER (WHERE status = 'pending')                                      AS pending_requests,
        COUNT(*) FILTER (WHERE status IN ('taken', 'in_progress'))                      AS in_progress_requests
      FROM requests.admin_requests
      WHERE deleted_at IS NULL
    `);

    return {
      users: {
        total:    parseInt(userStats?.total_users    ?? '0', 10),
        active:   parseInt(userStats?.active_users   ?? '0', 10),
        inactive: parseInt(userStats?.inactive_users ?? '0', 10),
      },
      modules: {
        total:    parseInt(moduleStats?.total_modules    ?? '0', 10),
        active:   parseInt(moduleStats?.active_modules   ?? '0', 10),
        inactive: parseInt(moduleStats?.inactive_modules ?? '0', 10),
      },
      tickets: {
        total: parseInt(ticketStats?.total_tickets ?? '0', 10),
        open:  parseInt(ticketStats?.open_tickets  ?? '0', 10),
      },
      requests: {
        total:       parseInt(requestStats?.total_requests       ?? '0', 10),
        pending:     parseInt(requestStats?.pending_requests     ?? '0', 10),
        in_progress: parseInt(requestStats?.in_progress_requests ?? '0', 10),
      },
    };
  }

  // ─── Roles globales ──────────────────────────────────────────────────────────

  async listGlobalRoles() {
    return this.db.query<any[]>(
      `SELECT id, name, description, is_active, deleted_at, created_at,
              (SELECT COUNT(*) FROM users.profiles WHERE global_role_id = gr.id AND deleted_at IS NULL)::int AS user_count
       FROM config.global_roles gr
       ORDER BY is_active DESC, name`,
    );
  }

  async createGlobalRole(name: string, description?: string) {
    const normalized = (name ?? '').trim().toLowerCase().replace(/\s+/g, '_');
    if (!normalized) throw new BadRequestException('name es requerido');

    const [existing] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM config.global_roles WHERE name = $1`,
      [normalized],
    );
    if (existing) throw new ConflictException(`Rol global '${normalized}' ya existe`);

    const [row] = await this.db.query<any[]>(
      `INSERT INTO config.global_roles (name, description) VALUES ($1, $2) RETURNING *`,
      [normalized, description ?? null],
    );
    return row;
  }

  async deleteGlobalRole(id: string) {
    const [role] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM config.global_roles WHERE id = $1`,
      [id],
    );
    if (!role) throw new NotFoundException(`Rol global ${id} no encontrado`);

    await this.db.query(
      `UPDATE config.global_roles SET is_active = false WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  async reactivateGlobalRole(id: string) {
    const [role] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM config.global_roles WHERE id = $1`,
      [id],
    );
    if (!role) throw new NotFoundException(`Rol global ${id} no encontrado`);

    await this.db.query(
      `UPDATE config.global_roles
       SET is_active = true, deleted_at = NULL, scheduled_hard_delete_at = NULL
       WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  // ─── Asignación masiva de roles ───────────────────────────────────────────────

  async bulkAssignModuleRole(actorId: string, userIds: string[], moduleId: string, roleId: string) {
    await this.assertModuleExists(moduleId);
    await this.assertActorCanManageModule(actorId, moduleId);

    const [role] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.module_roles WHERE id = $1 AND module_id = $2 AND is_active = true`,
      [roleId, moduleId],
    );
    if (!role) throw new NotFoundException(`Rol ${roleId} no existe en módulo ${moduleId}`);

    const results: { userId: string; ok: boolean; error?: string }[] = [];

    for (const userId of userIds) {
      try {
        await this.assertUserExists(userId);
        const [existing] = await this.db.query<{ id: string; is_active: boolean }[]>(
          `SELECT id, is_active FROM modules.user_module_roles
           WHERE user_id = $1 AND module_id = $2 AND role_id = $3`,
          [userId, moduleId, roleId],
        );

        if (existing) {
          if (!existing.is_active) {
            await this.db.query(
              `UPDATE modules.user_module_roles
               SET is_active = true, assigned_by = $1, assigned_at = now()
               WHERE id = $2`,
              [actorId, existing.id],
            );
          }
        } else {
          await this.db.query(
            `INSERT INTO modules.user_module_roles (user_id, module_id, role_id, assigned_by)
             VALUES ($1, $2, $3, $4)`,
            [userId, moduleId, roleId, actorId],
          );
        }
        results.push({ userId, ok: true });
      } catch (e: any) {
        results.push({ userId, ok: false, error: e.message });
      }
    }

    this.logger.log(`Bulk-assign rol ${roleId} en módulo ${moduleId}: ${results.filter(r => r.ok).length}/${userIds.length} ok`);
    return {
      assigned: results.filter(r => r.ok).length,
      errors:   results.filter(r => !r.ok),
      results,
    };
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────────

  private async assertUserExists(userId: string): Promise<void> {
    const [u] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (!u) throw new NotFoundException(`Usuario ${userId} no encontrado`);
  }

  private async assertModuleExists(moduleId: string): Promise<void> {
    const [m] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.modules WHERE id = $1 AND deleted_at IS NULL`,
      [moduleId],
    );
    if (!m) throw new NotFoundException(`Módulo ${moduleId} no encontrado`);
  }

  private async assertActorCanManageModule(actorId: string, moduleId: string): Promise<void> {
    const [actor] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [actorId],
    );
    if (!actor) throw new ForbiddenException();
    if (actor.is_superadmin) return;

    const [adminRole] = await this.db.query<{ id: string }[]>(
      `SELECT umr.id
       FROM   modules.user_module_roles umr
       JOIN   modules.module_roles      mr ON mr.id = umr.role_id
       WHERE  umr.user_id  = $1
         AND  umr.module_id = $2
         AND  mr.name       = 'admin_modulo'
         AND  umr.is_active = true`,
      [actorId, moduleId],
    );
    if (!adminRole) throw new ForbiddenException('Sin permisos en ese módulo');
  }
}
