import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AvailabilityDto } from './dto/availability.dto';
import { SelfAvailabilityDto } from './dto/self-availability.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

const REASON_TO_STATUS: Record<string, string> = {
  vacation:        'ausente',
  maternity_leave: 'ausente',
  sick_leave:      'ausente',
  training:        'fuera_horario',
  other:           'ausente',
};

@Injectable()
export class SkillService {
  private readonly logger = new Logger(SkillService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ─── Disponibilidad ──────────────────────────────────────────────────────────

  async getAvailability(userId: string) {
    await this.assertUserExists(userId);

    return this.db.query<any[]>(
      `SELECT ts.id,
              ts.module_id,
              m.name           AS module_name,
              m.slug           AS module_slug,
              ts.status,
              ts.is_available,
              ts.reason,
              ts.unavailable_from,
              ts.unavailable_to,
              ts.notes,
              ts.updated_at
       FROM   modules.technician_status ts
       JOIN   modules.modules           m ON m.id = ts.module_id
       WHERE  ts.user_id = $1
       ORDER  BY m.name`,
      [userId],
    );
  }

  async setAvailability(actorId: string, userId: string, dto: AvailabilityDto) {
    await this.assertUserExists(userId);
    await this.assertModuleExists(dto.module_id);
    await this.assertActorCanManageModule(actorId, dto.module_id);

    const newStatus = dto.is_available
      ? 'disponible'
      : (REASON_TO_STATUS[dto.reason ?? ''] ?? 'ausente');

    if (dto.is_available) {
      await this.db.query(
        `INSERT INTO modules.technician_status
           (user_id, module_id, is_available, status, reason, unavailable_from, unavailable_to, notes, created_by)
         VALUES ($1, $2, true, $3, NULL, NULL, NULL, NULL, $4)
         ON CONFLICT (user_id, module_id) DO UPDATE SET
           is_available     = true,
           status           = EXCLUDED.status,
           reason           = NULL,
           unavailable_from = NULL,
           unavailable_to   = NULL,
           notes            = NULL`,
        [userId, dto.module_id, newStatus, actorId],
      );
    } else {
      await this.db.query(
        `INSERT INTO modules.technician_status
           (user_id, module_id, is_available, status, reason, unavailable_from, unavailable_to, notes, created_by)
         VALUES ($1, $2, false, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (user_id, module_id) DO UPDATE SET
           is_available     = false,
           status           = EXCLUDED.status,
           reason           = EXCLUDED.reason,
           unavailable_from = EXCLUDED.unavailable_from,
           unavailable_to   = EXCLUDED.unavailable_to,
           notes            = EXCLUDED.notes`,
        [
          userId,
          dto.module_id,
          newStatus,
          dto.reason           ?? null,
          dto.unavailable_from ?? null,
          dto.unavailable_to   ?? null,
          dto.notes            ?? null,
          actorId,
        ],
      );
    }

    this.logger.log(`Disponibilidad de ${userId} en módulo ${dto.module_id} actualizada por ${actorId}`);
    return this.getAvailability(userId);
  }

  async setMyAvailability(userId: string, dto: SelfAvailabilityDto) {
    await this.assertUserExists(userId);
    await this.assertModuleExists(dto.module_id);

    const [membership] = await this.db.query<{ id: string }[]>(
      `SELECT umr.id
       FROM   modules.user_module_roles umr
       JOIN   modules.module_roles      mr ON mr.id = umr.role_id
       WHERE  umr.user_id   = $1
         AND  umr.module_id  = $2
         AND  umr.is_active  = true
         AND  mr.name IN ('tecnico', 'jefe_tecnico')`,
      [userId, dto.module_id],
    );
    if (!membership) throw new ForbiddenException('No eres técnico en este módulo');

    const unavailableStatuses = ['fuera_horario', 'ausente', 'offline'];
    const is_available = !unavailableStatuses.includes(dto.status);

    await this.db.query(
      `INSERT INTO modules.technician_status
         (user_id, module_id, is_available, status, unavailable_to, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $1)
       ON CONFLICT (user_id, module_id) DO UPDATE SET
         is_available     = EXCLUDED.is_available,
         status           = EXCLUDED.status,
         unavailable_to   = EXCLUDED.unavailable_to,
         notes            = EXCLUDED.notes,
         updated_at       = now()`,
      [userId, dto.module_id, is_available, dto.status, dto.unavailable_to ?? null, dto.notes ?? null],
    );

    this.eventEmitter.emit('tech.availability.changed', {
      userId,
      moduleId:    dto.module_id,
      status:      dto.status,
      isAvailable: is_available,
    });

    return this.getAvailability(userId);
  }

  // ─── Perfiles de técnico ──────────────────────────────────────────────────────
  // Reemplaza modules.technician_skills (eliminado en v7.0).
  // Ahora usa tickets.technician_profiles + tickets.technician_category_skills.

  async getSkills(userId: string) {
    await this.assertUserExists(userId);

    return this.db.query<any[]>(
      `SELECT tp.id,
              tp.module_id,
              m.name              AS module_name,
              m.slug              AS module_slug,
              tp.technician_type,
              tp.max_daily_tickets,
              tp.is_active,
              tp.created_at,
              tp.updated_at,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id',            tcs.id,
                    'category_id',   tcs.category_id,
                    'category_name', cat.name,
                    'category_slug', cat.slug
                  )
                ) FILTER (WHERE tcs.id IS NOT NULL AND tcs.is_active = true),
                '[]'
              ) AS category_skills
       FROM   tickets.technician_profiles           tp
       JOIN   modules.modules                       m   ON m.id         = tp.module_id
       LEFT JOIN tickets.technician_category_skills tcs ON tcs.user_id  = tp.user_id
                                                       AND tcs.module_id = tp.module_id
                                                       AND tcs.is_active = true
       LEFT JOIN modules.categories                 cat ON cat.id = tcs.category_id
       WHERE  tp.user_id   = $1
         AND  tp.is_active = true
       GROUP  BY tp.id, m.name, m.slug
       ORDER  BY m.name`,
      [userId],
    );
  }

  async addSkill(actorId: string, userId: string, dto: AddSkillDto) {
    await this.assertUserExists(userId);
    await this.assertModuleExists(dto.module_id);
    await this.assertActorCanManageModule(actorId, dto.module_id);

    const [profile] = await this.db.query<{ id: string }[]>(
      `INSERT INTO tickets.technician_profiles
         (user_id, module_id, technician_type, max_daily_tickets)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, module_id) DO UPDATE SET
         technician_type   = EXCLUDED.technician_type,
         max_daily_tickets = EXCLUDED.max_daily_tickets,
         is_active         = true,
         updated_at        = now()
       RETURNING id`,
      [
        userId,
        dto.module_id,
        dto.technician_type   ?? 'generalist',
        dto.max_daily_tickets ?? null,
      ],
    );

    if (dto.category_ids?.length) {
      for (const categoryId of dto.category_ids) {
        await this.db.query(
          `INSERT INTO tickets.technician_category_skills
             (user_id, module_id, category_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, module_id, category_id) DO UPDATE SET
             is_active  = true,
             updated_at = now()`,
          [userId, dto.module_id, categoryId],
        );
      }
    }

    this.logger.log(`Perfil técnico configurado para usuario ${userId} en módulo ${dto.module_id} por ${actorId}`);
    return this.getSkills(userId);
  }

  async updateSkill(actorId: string, userId: string, skillId: string, dto: UpdateSkillDto) {
    const [profile] = await this.db.query<{ id: string; module_id: string }[]>(
      `SELECT id, module_id FROM tickets.technician_profiles
       WHERE  id = $1 AND user_id = $2 AND is_active = true`,
      [skillId, userId],
    );
    if (!profile) throw new NotFoundException(`Perfil técnico ${skillId} no encontrado para usuario ${userId}`);

    await this.assertActorCanManageModule(actorId, profile.module_id);

    const fields: string[] = [];
    const params: unknown[] = [];

    const add = (col: string, val: unknown) => {
      params.push(val);
      fields.push(`${col} = $${params.length}`);
    };

    if (dto.technician_type   !== undefined) add('technician_type',   dto.technician_type);
    if (dto.max_daily_tickets !== undefined) add('max_daily_tickets', dto.max_daily_tickets);

    const hasFields    = fields.length > 0;
    const hasAddCats   = (dto.category_ids_add?.length    ?? 0) > 0;
    const hasRemoveCats = (dto.category_ids_remove?.length ?? 0) > 0;

    if (!hasFields && !hasAddCats && !hasRemoveCats) {
      throw new BadRequestException('Sin campos para actualizar');
    }

    if (hasFields) {
      params.push(skillId);
      await this.db.query(
        `UPDATE tickets.technician_profiles SET ${fields.join(', ')}, updated_at = now()
         WHERE id = $${params.length}`,
        params,
      );
    }

    if (hasAddCats) {
      for (const catId of dto.category_ids_add!) {
        await this.db.query(
          `INSERT INTO tickets.technician_category_skills (user_id, module_id, category_id)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, module_id, category_id) DO UPDATE SET
             is_active = true, updated_at = now()`,
          [userId, profile.module_id, catId],
        );
      }
    }

    if (hasRemoveCats) {
      await this.db.query(
        `UPDATE tickets.technician_category_skills
         SET    is_active = false, updated_at = now()
         WHERE  user_id   = $1
           AND  module_id  = $2
           AND  category_id = ANY($3::uuid[])`,
        [userId, profile.module_id, dto.category_ids_remove],
      );
    }

    return this.getSkills(userId);
  }

  async removeSkill(actorId: string, userId: string, skillId: string) {
    const [profile] = await this.db.query<{ id: string; module_id: string; is_active: boolean }[]>(
      `SELECT id, module_id, is_active FROM tickets.technician_profiles
       WHERE  id = $1 AND user_id = $2`,
      [skillId, userId],
    );
    if (!profile) throw new NotFoundException(`Perfil técnico ${skillId} no encontrado para usuario ${userId}`);
    if (!profile.is_active) throw new BadRequestException('Perfil técnico ya está inactivo');

    await this.assertActorCanManageModule(actorId, profile.module_id);

    await this.db.query(
      `UPDATE tickets.technician_profiles
       SET    is_active = false, updated_at = now()
       WHERE  id = $1`,
      [skillId],
    );
    await this.db.query(
      `UPDATE tickets.technician_category_skills
       SET    is_active = false, updated_at = now()
       WHERE  user_id   = $1
         AND  module_id  = $2`,
      [userId, profile.module_id],
    );

    this.logger.log(`Perfil técnico ${skillId} desactivado para usuario ${userId} por ${actorId}`);
    return { ok: true, message: 'Perfil técnico desactivado' };
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
       WHERE  umr.user_id   = $1
         AND  umr.module_id  = $2
         AND  mr.name        = 'admin_modulo'
         AND  umr.is_active  = true`,
      [actorId, moduleId],
    );
    if (!adminRole) throw new ForbiddenException('Sin permisos en ese módulo');
  }
}
