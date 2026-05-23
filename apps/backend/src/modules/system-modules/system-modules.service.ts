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
                maintenance_mode, maintenance_since, maintenance_message,
                access_mode, assignment_mode, priority_mode, priority_editors,
                priority_period_start, priority_period_end, created_at
         FROM modules.modules
         WHERE deleted_at IS NULL
         ORDER BY is_active DESC, name`,
      );
    }

    // Non-superadmin: only modules assigned to user
    return this.db.query<any[]>(
      `SELECT DISTINCT m.id, m.name, m.slug, m.description, m.type, m.image_url,
              m.color, m.is_active, m.maintenance_mode, m.maintenance_message,
              m.access_mode, m.assignment_mode, m.priority_mode, m.priority_editors,
              m.priority_period_start, m.priority_period_end, m.created_at
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
      `SELECT m.id, m.name, m.slug, m.description, m.type, m.image_url, m.color,
              m.is_active, m.maintenance_mode, m.maintenance_message,
              m.access_mode, m.assignment_mode, m.priority_mode, m.priority_editors,
              m.priority_period_start, m.priority_period_end,
              COUNT(DISTINCT umr.user_id) AS members_count,
              COUNT(DISTINCT CASE WHEN mr.name IN ('tecnico','jefe_tecnico') THEN umr.user_id END) AS techs_count,
              COUNT(DISTINCT CASE WHEN mr.name = 'admin_modulo' THEN umr.user_id END) AS admins_count
       FROM   modules.modules m
       LEFT JOIN modules.user_module_roles umr ON umr.module_id = m.id AND umr.is_active = true
       LEFT JOIN modules.module_roles      mr  ON mr.id = umr.role_id
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
    const {
      name, description, type, image_url, color, is_active,
      access_mode, assignment_mode, priority_mode, priority_editors,
      priority_period_start, priority_period_end,
    } = dto as any;
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

    /* ── Operational config (migration 004) ── */
    if (access_mode !== undefined)          { fields.push(`access_mode = $${idx++}`);          values.push(access_mode); }
    if (assignment_mode !== undefined)      { fields.push(`assignment_mode = $${idx++}`);      values.push(assignment_mode); }
    if (priority_mode !== undefined)        { fields.push(`priority_mode = $${idx++}`);        values.push(priority_mode); }
    if (priority_editors !== undefined)     { fields.push(`priority_editors = $${idx++}`);     values.push(priority_editors); }
    if ('priority_period_start' in dto)     { fields.push(`priority_period_start = $${idx++}`); values.push(priority_period_start ?? null); }
    if ('priority_period_end' in dto)       { fields.push(`priority_period_end = $${idx++}`);   values.push(priority_period_end ?? null); }

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

  /* ── Role CRUD ──────────────────────────────────────────────────── */

  async createRole(moduleId: string, name: string, description?: string) {
    const [mod] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.modules WHERE id = $1 AND deleted_at IS NULL`,
      [moduleId],
    );
    if (!mod) throw new NotFoundException(`Módulo ${moduleId} no encontrado`);

    const [existing] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.module_roles WHERE module_id = $1 AND name = $2`,
      [moduleId, name],
    );
    if (existing) throw new BadRequestException(`Ya existe un rol con ese nombre en este módulo`);

    const [role] = await this.db.query<any[]>(
      `INSERT INTO modules.module_roles (module_id, name, description)
       VALUES ($1, $2, $3) RETURNING *`,
      [moduleId, name, description ?? null],
    );
    return role;
  }

  async updateRole(roleId: string, dto: { name?: string; description?: string }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    if (dto.name        !== undefined) { fields.push(`name = $${idx++}`);        values.push(dto.name); }
    if (dto.description !== undefined) { fields.push(`description = $${idx++}`); values.push(dto.description); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(roleId);
    const [role] = await this.db.query<any[]>(
      `UPDATE modules.module_roles SET ${fields.join(', ')} WHERE id = $${idx} AND is_active = true RETURNING *`,
      values,
    );
    if (!role) throw new NotFoundException(`Rol ${roleId} no encontrado`);
    return role;
  }

  async deleteRole(roleId: string) {
    const [role] = await this.db.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM modules.module_roles WHERE id = $1 AND is_active = true`,
      [roleId],
    );
    if (!role) throw new NotFoundException(`Rol ${roleId} no encontrado`);
    await this.db.query(
      `UPDATE modules.module_roles SET is_active = false, updated_at = now() WHERE id = $1`,
      [roleId],
    );
    return { ok: true, message: `Rol "${role.name}" desactivado` };
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

  /* ── Module SLA rules ───────────────────────────────────────────── */

  async getModuleSlaRules(moduleId: string) {
    const priorities = ['baja', 'media', 'alta', 'critica'];

    const [globals, overrides] = await Promise.all([
      this.db.query<any[]>(
        `SELECT priority, hours_to_resolve, hours_to_first_response
         FROM   config.sla_rules
         WHERE  request_type IS NULL
         ORDER  BY CASE priority WHEN 'baja' THEN 1 WHEN 'media' THEN 2 WHEN 'alta' THEN 3 WHEN 'critica' THEN 4 END`,
      ),
      this.db.query<any[]>(
        `SELECT id, priority, hours_to_resolve, hours_to_first_response
         FROM   modules.module_sla_rules
         WHERE  module_id = $1`,
        [moduleId],
      ),
    ]);

    const overrideMap = new Map(overrides.map((r) => [r.priority, r]));
    const globalMap   = new Map(globals.map((r) => [r.priority, r]));

    return priorities.map((p) => {
      const override = overrideMap.get(p);
      const global   = globalMap.get(p);
      return {
        priority:               p,
        hours_to_resolve:       override?.hours_to_resolve        ?? global?.hours_to_resolve        ?? 24,
        hours_to_first_response: override?.hours_to_first_response ?? global?.hours_to_first_response ?? 1,
        is_override:            !!override,
        override_id:            override?.id ?? null,
        global_hours_to_resolve:        global?.hours_to_resolve        ?? 24,
        global_hours_to_first_response: global?.hours_to_first_response ?? 1,
      };
    });
  }

  async upsertModuleSlaRule(
    moduleId: string,
    priority: string,
    dto: { hours_to_resolve: number; hours_to_first_response: number },
  ) {
    const validPriorities = ['baja', 'media', 'alta', 'critica'];
    if (!validPriorities.includes(priority)) {
      throw new BadRequestException(`Prioridad inválida: ${priority}`);
    }
    const [row] = await this.db.query<any[]>(
      `INSERT INTO modules.module_sla_rules (module_id, priority, hours_to_resolve, hours_to_first_response)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (module_id, priority) DO UPDATE
         SET hours_to_resolve        = EXCLUDED.hours_to_resolve,
             hours_to_first_response = EXCLUDED.hours_to_first_response,
             updated_at              = now()
       RETURNING *`,
      [moduleId, priority, dto.hours_to_resolve, dto.hours_to_first_response],
    );
    return row;
  }

  async deleteModuleSlaRule(moduleId: string, priority: string) {
    await this.db.query(
      `DELETE FROM modules.module_sla_rules WHERE module_id = $1 AND priority = $2`,
      [moduleId, priority],
    );
    return { ok: true };
  }
}
