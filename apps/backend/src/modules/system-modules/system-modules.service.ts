import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SystemModulesService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async findAll(userId: string) {
    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );

    if (profile?.is_superadmin) {
      return this.db.query<any[]>(
        `SELECT id, name, slug, description, type, image_url, color, is_active,
                maintenance_mode, maintenance_since, maintenance_message, created_at
         FROM modules.modules
         WHERE deleted_at IS NULL
         ORDER BY is_active DESC, name`,
      );
    }

    // Non-superadmin: only modules assigned to user
    return this.db.query<any[]>(
      `SELECT DISTINCT m.id, m.name, m.slug, m.description, m.type, m.image_url,
              m.color, m.is_active, m.maintenance_mode, m.maintenance_message, m.created_at
       FROM   modules.modules           m
       JOIN   modules.user_module_roles umr ON umr.module_id = m.id
                                           AND umr.user_id   = $1
                                           AND umr.is_active = true
       WHERE  m.deleted_at IS NULL AND m.is_active = true
       ORDER  BY m.name`,
      [userId],
    );
  }

  async findOne(id: string) {
    const rows = await this.db.query<any[]>(
      `SELECT m.id, m.name, m.slug, m.description, m.type, m.image_url, m.is_active,
              COUNT(DISTINCT umr.user_id) AS member_count
       FROM   modules.modules m
       LEFT JOIN modules.user_module_roles umr ON umr.module_id = m.id AND umr.is_active = true
       WHERE  m.id = $1 AND m.deleted_at IS NULL
       GROUP  BY m.id`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`Módulo ${id} no encontrado`);
    return rows[0];
  }

  async getModuleRoles(moduleId: string) {
    return this.db.query<any[]>(
      `SELECT id, name, description, is_active
       FROM modules.module_roles
       WHERE module_id = $1 AND is_active = true
       ORDER BY name`,
      [moduleId],
    );
  }

  async create(dto: Record<string, unknown>) {
    const { name, description, type, image_url, color } = dto as any;

    // Auto-generate slug from name
    const slug = String(name ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    // Handle slug conflicts by appending counter
    let finalSlug = slug;
    let counter = 1;
    while (true) {
      const [conflict] = await this.db.query<{ id: string }[]>(
        `SELECT id FROM modules.modules WHERE slug = $1 AND deleted_at IS NULL`,
        [finalSlug],
      );
      if (!conflict) break;
      finalSlug = `${slug}-${counter++}`;
    }

    const rows = await this.db.query<any[]>(
      `INSERT INTO modules.modules (name, slug, description, type, image_url, color)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, finalSlug, description ?? null, type ?? 'custom', image_url ?? null, color ?? null],
    );
    return rows[0];
  }

  async updateModule(id: string, dto: Record<string, unknown>) {
    const { name, description, type, image_url, color, is_active } = dto as any;
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(is_active); }

    if (name !== undefined) {
      const slug = String(name).toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
        .replace(/-+/g, '-').replace(/^-|-$/g, '');

      let finalSlug = slug;
      let counter = 1;
      while (true) {
        const [conflict] = await this.db.query<{ id: string }[]>(
          `SELECT id FROM modules.modules WHERE slug = $1 AND id != $2 AND deleted_at IS NULL`,
          [finalSlug, id],
        );
        if (!conflict) break;
        finalSlug = `${slug}-${counter++}`;
      }
      fields.push(`name = $${idx++}`); values.push(name);
      fields.push(`slug = $${idx++}`); values.push(finalSlug);
    }
    if (description !== undefined) { fields.push(`description = $${idx++}`); values.push(description); }
    if (type !== undefined) { fields.push(`type = $${idx++}`); values.push(type); }
    if (image_url !== undefined) { fields.push(`image_url = $${idx++}`); values.push(image_url); }
    if (color !== undefined) { fields.push(`color = $${idx++}`); values.push(color || null); }

    if (!fields.length) throw new BadRequestException('Nada que actualizar');

    values.push(id);
    const rows = await this.db.query<any[]>(
      `UPDATE modules.modules SET ${fields.join(', ')}
       WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (!rows[0]) throw new NotFoundException(`Módulo ${id} no encontrado`);
    return rows[0];
  }

  async deleteModule(id: string) {
    const [mod] = await this.db.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM modules.modules WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!mod) throw new NotFoundException(`Módulo ${id} no encontrado`);

    await this.db.query(
      `UPDATE modules.modules
       SET deleted_at               = now(),
           is_active                = false,
           scheduled_hard_delete_at = now() + INTERVAL '90 days'
       WHERE id = $1`,
      [id],
    );
    return {
      ok: true,
      message: `Módulo "${mod.name}" eliminado. Se conservará durante 90 días antes del borrado definitivo.`,
      module: { id: mod.id, name: mod.name },
    };
  }

  async toggleMaintenance(id: string, userId: string, enabled: boolean, message?: string) {
    const [mod] = await this.db.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM modules.modules WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!mod) throw new NotFoundException(`Módulo ${id} no encontrado`);

    await this.db.query(
      `UPDATE modules.modules
       SET maintenance_mode    = $1,
           maintenance_by      = $2,
           maintenance_since   = CASE WHEN $1 THEN now() ELSE NULL END,
           maintenance_message = $3
       WHERE id = $4`,
      [enabled, enabled ? userId : null, message ?? null, id],
    );

    return { ok: true, maintenance_mode: enabled, module: { id: mod.id, name: mod.name } };
  }

  async restoreModule(id: string) {
    const [mod] = await this.db.query<{ id: string; name: string; scheduled_hard_delete_at: string }[]>(
      `SELECT id, name, scheduled_hard_delete_at
       FROM modules.modules
       WHERE id = $1 AND deleted_at IS NOT NULL`,
      [id],
    );
    if (!mod) throw new NotFoundException(`Módulo ${id} no encontrado en la papelera`);

    if (mod.scheduled_hard_delete_at && new Date(mod.scheduled_hard_delete_at) < new Date()) {
      throw new BadRequestException('El período de retención expiró — el módulo ya no puede recuperarse');
    }

    await this.db.query(
      `UPDATE modules.modules
       SET deleted_at = NULL, is_active = true, scheduled_hard_delete_at = NULL
       WHERE id = $1`,
      [id],
    );
    return { ok: true, message: `Módulo "${mod.name}" restaurado correctamente.` };
  }

  async findDeleted() {
    return this.db.query<any[]>(
      `SELECT id, name, slug, description, type, image_url, deleted_at, scheduled_hard_delete_at,
              EXTRACT(DAY FROM (scheduled_hard_delete_at - now())) AS days_remaining
       FROM modules.modules
       WHERE deleted_at IS NOT NULL
         AND (scheduled_hard_delete_at IS NULL OR scheduled_hard_delete_at > now())
       ORDER BY deleted_at DESC`,
    );
  }

  async findAllLocations() {
    return this.db.query<any[]>(
      `SELECT l.id, l.name, l.address, l.module_id, m.name AS module_name
       FROM   modules.locations l
       JOIN   modules.modules   m ON m.id = l.module_id
       WHERE  l.is_active = true AND l.deleted_at IS NULL
         AND  m.is_active = true AND m.deleted_at IS NULL
       ORDER  BY m.name, l.name`,
    );
  }

  async findEnvironmentsByLocation(locationId: string) {
    return this.db.query<any[]>(
      `SELECT e.id, e.name, e.description, e.location_id
       FROM   modules.environments e
       WHERE  e.location_id = $1 AND e.is_active = true AND e.deleted_at IS NULL
       ORDER  BY e.name`,
      [locationId],
    );
  }
}
