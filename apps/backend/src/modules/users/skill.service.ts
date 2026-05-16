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
import { AvailabilityDto } from './dto/availability.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';

@Injectable()
export class SkillService {
  private readonly logger = new Logger(SkillService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ─── Disponibilidad ──────────────────────────────────────────────────────────

  async getAvailability(userId: string) {
    await this.assertUserExists(userId);

    return this.db.query<any[]>(
      `SELECT ts.id,
              ts.module_id,
              m.name           AS module_name,
              m.slug           AS module_slug,
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

    if (dto.is_available) {
      await this.db.query(
        `INSERT INTO modules.technician_status
           (user_id, module_id, is_available, reason, unavailable_from, unavailable_to, notes, created_by)
         VALUES ($1, $2, true, NULL, NULL, NULL, NULL, $3)
         ON CONFLICT (user_id, module_id) DO UPDATE SET
           is_available     = true,
           reason           = NULL,
           unavailable_from = NULL,
           unavailable_to   = NULL,
           notes            = NULL`,
        [userId, dto.module_id, actorId],
      );
    } else {
      await this.db.query(
        `INSERT INTO modules.technician_status
           (user_id, module_id, is_available, reason, unavailable_from, unavailable_to, notes, created_by)
         VALUES ($1, $2, false, $3, $4, $5, $6, $7)
         ON CONFLICT (user_id, module_id) DO UPDATE SET
           is_available     = false,
           reason           = EXCLUDED.reason,
           unavailable_from = EXCLUDED.unavailable_from,
           unavailable_to   = EXCLUDED.unavailable_to,
           notes            = EXCLUDED.notes`,
        [
          userId,
          dto.module_id,
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

  // ─── Skills ──────────────────────────────────────────────────────────────────

  async getSkills(userId: string) {
    await this.assertUserExists(userId);

    return this.db.query<any[]>(
      `SELECT ts.id,
              ts.module_id,
              m.name          AS module_name,
              ts.category_slug,
              ts.location_slug,
              ts.service_type,
              ts.max_concurrent,
              ts.priority,
              ts.is_active,
              ts.created_at,
              ts.updated_at
       FROM   modules.technician_skills ts
       JOIN   modules.modules           m ON m.id = ts.module_id
       WHERE  ts.user_id     = $1
         AND  ts.is_active   = true
         AND  ts.deleted_at  IS NULL
       ORDER  BY m.name, ts.priority DESC`,
      [userId],
    );
  }

  async addSkill(actorId: string, userId: string, dto: AddSkillDto) {
    await this.assertUserExists(userId);
    await this.assertModuleExists(dto.module_id);
    await this.assertActorCanManageModule(actorId, dto.module_id);

    const [existing] = await this.db.query<{ id: string; is_active: boolean; deleted_at: string | null }[]>(
      `SELECT id, is_active, deleted_at FROM modules.technician_skills
       WHERE  module_id     = $1
         AND  user_id       = $2
         AND  (category_slug = $3 OR (category_slug IS NULL AND $3::text IS NULL))`,
      [dto.module_id, userId, dto.category_slug ?? null],
    );

    if (existing) {
      if (existing.is_active && !existing.deleted_at) {
        throw new ConflictException('Usuario ya tiene esa skill en ese módulo/categoría');
      }
      await this.db.query(
        `UPDATE modules.technician_skills
         SET    is_active     = true,
                deleted_at    = NULL,
                max_concurrent = $1,
                priority      = $2
         WHERE  id = $3`,
        [dto.max_concurrent ?? 10, dto.priority ?? 0, existing.id],
      );
      return this.getSkills(userId);
    }

    await this.db.query(
      `INSERT INTO modules.technician_skills
         (module_id, user_id, category_slug, location_slug, service_type, max_concurrent, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        dto.module_id,
        userId,
        dto.category_slug  ?? null,
        dto.location_slug  ?? null,
        dto.service_type   ?? null,
        dto.max_concurrent ?? 10,
        dto.priority       ?? 0,
      ],
    );

    this.logger.log(`Skill añadida a usuario ${userId} en módulo ${dto.module_id} por ${actorId}`);
    return this.getSkills(userId);
  }

  async updateSkill(actorId: string, userId: string, skillId: string, dto: UpdateSkillDto) {
    const [skill] = await this.db.query<{ id: string; module_id: string }[]>(
      `SELECT id, module_id FROM modules.technician_skills
       WHERE  id = $1 AND user_id = $2 AND is_active = true AND deleted_at IS NULL`,
      [skillId, userId],
    );
    if (!skill) throw new NotFoundException(`Skill ${skillId} no encontrada para usuario ${userId}`);

    await this.assertActorCanManageModule(actorId, skill.module_id);

    const fields: string[] = [];
    const params: unknown[] = [];

    const add = (col: string, val: unknown) => {
      params.push(val);
      fields.push(`${col} = $${params.length}`);
    };

    if (dto.max_concurrent !== undefined) add('max_concurrent', dto.max_concurrent);
    if (dto.priority       !== undefined) add('priority',       dto.priority);

    if (fields.length === 0) throw new BadRequestException('Sin campos para actualizar');

    params.push(skillId);
    await this.db.query(
      `UPDATE modules.technician_skills SET ${fields.join(', ')} WHERE id = $${params.length}`,
      params,
    );

    return this.getSkills(userId);
  }

  async removeSkill(actorId: string, userId: string, skillId: string) {
    const [skill] = await this.db.query<{ id: string; module_id: string; is_active: boolean }[]>(
      `SELECT id, module_id, is_active FROM modules.technician_skills
       WHERE  id = $1 AND user_id = $2`,
      [skillId, userId],
    );
    if (!skill) throw new NotFoundException(`Skill ${skillId} no encontrada para usuario ${userId}`);
    if (!skill.is_active) throw new BadRequestException('Skill ya está inactiva');

    await this.assertActorCanManageModule(actorId, skill.module_id);

    await this.db.query(
      `UPDATE modules.technician_skills
       SET    is_active = false, deleted_at = now()
       WHERE  id = $1`,
      [skillId],
    );

    this.logger.log(`Skill ${skillId} removida de usuario ${userId} por ${actorId}`);
    return { ok: true, message: 'Skill desactivada' };
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
