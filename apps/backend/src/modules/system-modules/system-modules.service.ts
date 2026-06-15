import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class SystemModulesService {
  private readonly logger = new Logger(SystemModulesService.name);

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
                priority_period_start, priority_period_end, created_at,
                true AS has_access
         FROM modules.modules
         WHERE deleted_at IS NULL
         ORDER BY is_active DESC, name`,
      );
    }

    // Non-superadmin: all active modules; has_access = open OR always-open type OR has a role
    return this.db.query<any[]>(
      `SELECT DISTINCT m.id, m.name, m.slug, m.description, m.type, m.image_url,
              m.color, m.is_active, m.maintenance_mode, m.maintenance_message,
              m.access_mode, m.assignment_mode, m.priority_mode, m.priority_editors,
              m.priority_period_start, m.priority_period_end, m.created_at,
              (m.access_mode = 'open'
               OR m.type IN ('inventario', 'inventory', 'gestion', 'administrative')
               OR umr.user_id IS NOT NULL) AS has_access
       FROM   modules.modules           m
       LEFT JOIN modules.user_module_roles umr ON umr.module_id = m.id
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
              m.specialization_mode, m.auto_close_hours, m.waiting_timeout_hours, m.approval_timeout_hours, m.max_reopen_count,
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

    // bootstrap_module creates the module + default roles, workflow, SLA policy, assignment policy,
    // and module settings in one atomic DB function. permission_scope defaults to the slug.
    const [result] = await this.db.query<{ module_id: string }[]>(
      `SELECT (modules.bootstrap_module(NULL, $1, $2, $3, false, NULL, $4, $2, false))::jsonb->>'module_id' AS module_id`,
      [name, finalSlug, description ?? null, type ?? 'custom'],
    );

    if (!result?.module_id) throw new Error('bootstrap_module no retornó module_id');

    // Apply image/color after bootstrap (not supported as bootstrap params)
    if (image_url || color) {
      await this.db.query(
        `UPDATE modules.modules SET image_url = $1, color = $2 WHERE id = $3`,
        [image_url ?? null, color ?? null, result.module_id],
      );
    }

    const [mod] = await this.db.query<any[]>(
      `SELECT * FROM modules.modules WHERE id = $1`,
      [result.module_id],
    );
    return mod;
  }

  async updateModule(id: string, dto: Record<string, unknown>) {
    const {
      name, description, type, image_url, color, is_active,
      access_mode, assignment_mode, priority_mode, priority_editors,
      priority_period_start, priority_period_end,
      specialization_mode, auto_close_hours, waiting_timeout_hours, approval_timeout_hours, max_reopen_count,
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
    // Built-in always-open modules (inventario, gestion) cannot change access_mode
    const [modRow] = await this.db.query<{ type: string }[]>(
      `SELECT type FROM modules.modules WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    const ALWAYS_OPEN_TYPES = ['inventario', 'inventory', 'gestion', 'administrative'];
    const isAlwaysOpen = modRow && ALWAYS_OPEN_TYPES.includes(modRow.type);
    if (access_mode !== undefined && !isAlwaysOpen) { fields.push(`access_mode = $${idx++}`); values.push(access_mode); }
    if (assignment_mode !== undefined)      { fields.push(`assignment_mode = $${idx++}`);      values.push(assignment_mode); }
    if (priority_mode !== undefined)        { fields.push(`priority_mode = $${idx++}`);        values.push(priority_mode); }
    if (priority_editors !== undefined)     { fields.push(`priority_editors = $${idx++}`);     values.push(priority_editors); }
    if ('priority_period_start' in dto)     { fields.push(`priority_period_start = $${idx++}`); values.push(priority_period_start ?? null); }
    if ('priority_period_end' in dto)       { fields.push(`priority_period_end = $${idx++}`);   values.push(priority_period_end ?? null); }

    /* ── Extended behavior config (migrations 019 + 048) ── */
    if (specialization_mode !== undefined)     { fields.push(`specialization_mode = $${idx++}`);     values.push(specialization_mode); }
    if (auto_close_hours !== undefined)        { fields.push(`auto_close_hours = $${idx++}`);         values.push(auto_close_hours); }
    if (waiting_timeout_hours !== undefined)   { fields.push(`waiting_timeout_hours = $${idx++}`);    values.push(waiting_timeout_hours); }
    if (approval_timeout_hours !== undefined)  { fields.push(`approval_timeout_hours = $${idx++}`);   values.push(approval_timeout_hours); }
    if (max_reopen_count !== undefined)        { fields.push(`max_reopen_count = $${idx++}`);         values.push(max_reopen_count); }

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

  async getModuleTechnicians(moduleId: string, requesterId: string, limit?: number, offset?: number) {
    const [isMember] = await this.db.query<{ ok: boolean }[]>(
      `SELECT (
         EXISTS(SELECT 1 FROM users.profiles WHERE id = $1 AND is_superadmin = true)
         OR
         EXISTS(SELECT 1 FROM modules.user_module_roles WHERE module_id = $2 AND user_id = $1 AND is_active = true)
       ) AS ok`,
      [requesterId, moduleId],
    );
    if (!isMember?.ok) throw new ForbiddenException('No eres miembro de este módulo');

    const params: unknown[] = [moduleId];
    let limitClause = '';
    if (limit != null) {
      params.push(limit);
      params.push(offset ?? 0);
      limitClause = `LIMIT $${params.length - 1} OFFSET $${params.length}`;
    }

    return this.db.query<any[]>(
      `SELECT p.id, p.first_name, p.last_name, p.username, p.avatar_url, mr.name AS role_name,
              COALESCE(
                (SELECT ROUND(AVG(COALESCE(r.score_overall,
                   (COALESCE(r.score_attention,0) + COALESCE(r.score_clarity,0)
                    + COALESCE(r.score_response_time,0) + COALESCE(r.score_quality,0)) / 4.0
                 ))::numeric, 1)
                 FROM   tickets.ticket_ratings r
                 WHERE  r.technician_id = p.id AND r.is_expired = false),
                0
              )::float AS avg_rating,
              (SELECT COUNT(*)::int
               FROM   tickets.ticket_assignments ta3
               JOIN   tickets.tickets t3 ON t3.id = ta3.ticket_id
               JOIN   tickets.states  s3 ON s3.id = t3.current_state_id
               WHERE  ta3.user_id = p.id AND ta3.role = 'owner' AND ta3.is_active = true
                 AND  s3.is_final = false AND t3.module_id = $1
              ) AS active_tickets,
              COALESCE(ts.is_available, true)      AS is_available,
              COALESCE(ts.status, 'disponible')    AS avail_status,
              ts.unavailable_to
       FROM   modules.user_module_roles umr
       JOIN   users.profiles p ON p.id = umr.user_id
       JOIN   modules.module_roles mr ON mr.id = umr.role_id
       LEFT JOIN modules.technician_status ts ON ts.user_id = p.id AND ts.module_id = $1
       WHERE  umr.module_id = $1 AND umr.is_active = true
         AND  mr.name IN ('tecnico', 'jefe_tecnico')
         AND  p.deleted_at IS NULL
       ORDER  BY mr.name DESC, p.first_name
       ${limitClause}`,
      params,
    );
  }

  async setTechnicianStatus(
    moduleId: string,
    userId:   string,
    dto: {
      status:          string;
      reason?:         string;
      unavailable_to?: string;
    },
  ) {
    const VALID_STATUSES = ['disponible','ocupado','en_reunion','fuera_horario','ausente','offline'];
    if (!VALID_STATUSES.includes(dto.status)) {
      throw new Error(`Estado inválido: ${dto.status}`);
    }
    const isAvailable = dto.status === 'disponible';

    await this.db.query(
      `INSERT INTO modules.technician_status
         (user_id, module_id, status, is_available, reason, unavailable_to, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $1)
       ON CONFLICT (user_id, module_id)
       DO UPDATE SET
         status          = EXCLUDED.status,
         is_available    = EXCLUDED.is_available,
         reason          = EXCLUDED.reason,
         unavailable_to  = EXCLUDED.unavailable_to,
         updated_at      = now()`,
      [
        userId, moduleId, dto.status, isAvailable,
        dto.reason ?? null,
        dto.unavailable_to ?? null,
      ],
    );

    return { ok: true, status: dto.status, is_available: isAvailable };
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

    // Bridge: keep tickets.sla_rules in sync so the active SLA engine sees admin changes.
    // sort_order=500 → below condition-based rules (which use lower values), acts as priority fallback.
    const [policy] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM tickets.sla_policies WHERE module_id = $1 AND is_active = true LIMIT 1`,
      [moduleId],
    );
    if (policy) {
      await this.db.query(
        `DELETE FROM tickets.sla_rules
         WHERE policy_id = $1 AND priority_result = $2 AND sort_order = 500`,
        [policy.id, priority],
      );
      await this.db.query(
        `INSERT INTO tickets.sla_rules (policy_id, sort_order, hours_to_resolve, priority_result, is_active)
         VALUES ($1, 500, $2, $3, true)`,
        [policy.id, dto.hours_to_resolve, priority],
      );
    } else {
      this.logger.warn(`Module ${moduleId}: no active sla_policy — ticket SLA bridge skipped`);
    }

    return row;
  }

  async deleteModuleSlaRule(moduleId: string, priority: string) {
    await this.db.query(
      `DELETE FROM modules.module_sla_rules WHERE module_id = $1 AND priority = $2`,
      [moduleId, priority],
    );

    // Remove bridge rule from tickets.sla_rules (falls back to evaluator hard constants)
    const [policy] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM tickets.sla_policies WHERE module_id = $1 AND is_active = true LIMIT 1`,
      [moduleId],
    );
    if (policy) {
      await this.db.query(
        `DELETE FROM tickets.sla_rules
         WHERE policy_id = $1 AND priority_result = $2 AND sort_order = 500`,
        [policy.id, priority],
      );
    }

    return { ok: true };
  }

  /* ── Categories (per module) ────────────────────────────────────── */

  async findCategoriesByModule(moduleId: string) {
    return this.db.query<any[]>(
      `SELECT c.id, c.module_id, c.parent_id, c.name, c.description, c.is_active,
              c.field_schema, c.created_at, c.updated_at,
              p.name AS parent_name
       FROM   modules.categories c
       LEFT JOIN modules.categories p ON p.id = c.parent_id
       WHERE  c.module_id = $1 AND c.deleted_at IS NULL
       ORDER  BY COALESCE(c.parent_id::text, c.id::text), c.parent_id NULLS FIRST, c.name`,
      [moduleId],
    );
  }

  async createCategory(moduleId: string, dto: { name: string; description?: string; parent_id?: string; field_schema?: any[] }) {
    const [mod] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.modules WHERE id = $1 AND deleted_at IS NULL`,
      [moduleId],
    );
    if (!mod) throw new NotFoundException(`Módulo ${moduleId} no encontrado`);

    if (dto.parent_id) {
      const [parent] = await this.db.query<{ id: string }[]>(
        `SELECT id FROM modules.categories WHERE id = $1 AND module_id = $2 AND deleted_at IS NULL`,
        [dto.parent_id, moduleId],
      );
      if (!parent) throw new BadRequestException('Categoría padre no encontrada o no pertenece a este módulo');
    }

    const [cat] = await this.db.query<any[]>(
      `INSERT INTO modules.categories (module_id, parent_id, name, description, field_schema)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [moduleId, dto.parent_id ?? null, dto.name.trim(), dto.description?.trim() ?? null, JSON.stringify(dto.field_schema ?? [])],
    );
    return cat;
  }

  async updateCategory(id: string, dto: { name?: string; description?: string; is_active?: boolean; field_schema?: any[] }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    if (dto.name         !== undefined) { fields.push(`name = $${idx++}`);         values.push(dto.name.trim()); }
    if (dto.description  !== undefined) { fields.push(`description = $${idx++}`);  values.push(dto.description?.trim() ?? null); }
    if (dto.is_active    !== undefined) { fields.push(`is_active = $${idx++}`);    values.push(dto.is_active); }
    if (dto.field_schema !== undefined) { fields.push(`field_schema = $${idx++}`); values.push(JSON.stringify(dto.field_schema)); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [cat] = await this.db.query<any[]>(
      `UPDATE modules.categories SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (!cat) throw new NotFoundException(`Categoría ${id} no encontrada`);
    return cat;
  }

  async deleteCategory(id: string) {
    const [cat] = await this.db.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM modules.categories WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!cat) throw new NotFoundException(`Categoría ${id} no encontrada`);

    const [hasAssets] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*)::text AS cnt FROM inventory.assets WHERE category_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (parseInt(hasAssets?.cnt ?? '0') > 0) {
      throw new BadRequestException('No se puede eliminar: existen activos con esta categoría. Desactívala en su lugar.');
    }

    await this.db.query(
      `UPDATE modules.categories SET deleted_at = now(), is_active = false WHERE id = $1`,
      [id],
    );
    return { ok: true, message: `Categoría "${cat.name}" eliminada` };
  }

  /* ── Locations (per module) ─────────────────────────────────────── */

  async findLocationsByModule(moduleId: string) {
    const locs = await this.db.query<any[]>(
      `SELECT l.id, l.module_id, l.name, l.address, l.is_active, l.created_at,
              COALESCE(json_agg(
                json_build_object(
                  'id', e.id, 'name', e.name, 'description', e.description,
                  'is_active', e.is_active
                ) ORDER BY e.name
              ) FILTER (WHERE e.id IS NOT NULL), '[]') AS environments
       FROM   modules.locations l
       LEFT JOIN modules.environments e ON e.location_id = l.id AND e.deleted_at IS NULL
       WHERE  l.module_id = $1 AND l.deleted_at IS NULL
       GROUP  BY l.id
       ORDER  BY l.name`,
      [moduleId],
    );
    return locs;
  }

  async createLocation(moduleId: string, dto: { name: string; address?: string }) {
    const [mod] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.modules WHERE id = $1 AND deleted_at IS NULL`,
      [moduleId],
    );
    if (!mod) throw new NotFoundException(`Módulo ${moduleId} no encontrado`);

    const [loc] = await this.db.query<any[]>(
      `INSERT INTO modules.locations (module_id, name, address)
       VALUES ($1, $2, $3) RETURNING *`,
      [moduleId, dto.name.trim(), dto.address?.trim() ?? null],
    );
    return loc;
  }

  async updateLocation(id: string, dto: { name?: string; address?: string; is_active?: boolean }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    if (dto.name      !== undefined) { fields.push(`name = $${idx++}`);      values.push(dto.name.trim()); }
    if (dto.address   !== undefined) { fields.push(`address = $${idx++}`);   values.push(dto.address?.trim() ?? null); }
    if (dto.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(dto.is_active); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [loc] = await this.db.query<any[]>(
      `UPDATE modules.locations SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (!loc) throw new NotFoundException(`Sede ${id} no encontrada`);
    return loc;
  }

  async deleteLocation(id: string) {
    const [loc] = await this.db.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM modules.locations WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!loc) throw new NotFoundException(`Sede ${id} no encontrada`);

    const [hasEnvs] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*)::text AS cnt FROM modules.environments WHERE location_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (parseInt(hasEnvs?.cnt ?? '0') > 0) {
      throw new BadRequestException('No se puede eliminar: la sede tiene ambientes. Elimínalos primero o desactívala.');
    }

    await this.db.query(
      `UPDATE modules.locations SET deleted_at = now(), is_active = false WHERE id = $1`,
      [id],
    );
    return { ok: true, message: `Sede "${loc.name}" eliminada` };
  }

  /* ── Environments (per location) ────────────────────────────────── */

  async createEnvironment(locationId: string, dto: { name: string; description?: string; module_id: string }) {
    const [loc] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.locations WHERE id = $1 AND module_id = $2 AND deleted_at IS NULL`,
      [locationId, dto.module_id],
    );
    if (!loc) throw new NotFoundException(`Sede ${locationId} no encontrada en este módulo`);

    const [env] = await this.db.query<any[]>(
      `INSERT INTO modules.environments (location_id, module_id, name, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [locationId, dto.module_id, dto.name.trim(), dto.description?.trim() ?? null],
    );
    return env;
  }

  async updateEnvironment(id: string, dto: { name?: string; description?: string; is_active?: boolean }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    if (dto.name        !== undefined) { fields.push(`name = $${idx++}`);        values.push(dto.name.trim()); }
    if (dto.description !== undefined) { fields.push(`description = $${idx++}`); values.push(dto.description?.trim() ?? null); }
    if (dto.is_active   !== undefined) { fields.push(`is_active = $${idx++}`);   values.push(dto.is_active); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [env] = await this.db.query<any[]>(
      `UPDATE modules.environments SET ${fields.join(', ')} WHERE id = $${idx} AND deleted_at IS NULL RETURNING *`,
      values,
    );
    if (!env) throw new NotFoundException(`Ambiente ${id} no encontrado`);
    return env;
  }

  async deleteEnvironment(id: string) {
    const [env] = await this.db.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM modules.environments WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!env) throw new NotFoundException(`Ambiente ${id} no encontrado`);

    const [hasAssets] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*)::text AS cnt FROM inventory.assets WHERE environment_id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (parseInt(hasAssets?.cnt ?? '0') > 0) {
      throw new BadRequestException('No se puede eliminar: existen activos en este ambiente. Desactívalo en su lugar.');
    }

    await this.db.query(
      `UPDATE modules.environments SET deleted_at = now(), is_active = false WHERE id = $1`,
      [id],
    );
    return { ok: true, message: `Ambiente "${env.name}" eliminado` };
  }

  /* ── Technician specializations ─────────────────────────────────── */

  /**
   * Returns all active specializations for a module, grouped by technician.
   * Each tech entry contains arrays of their damage_type and category associations.
   */
  async getSpecializations(moduleId: string) {
    const rows = await this.db.query<{
      spec_id:         string;
      user_id:         string;
      first_name:      string;
      last_name:       string;
      email:           string;
      role_name:       string;
      damage_type_id:  string | null;
      damage_label:    string | null;
      damage_weight:   number | null;
      category_id:     string | null;
      category_name:   string | null;
    }[]>(
      `SELECT ts.id              AS spec_id,
              ts.user_id,
              p.first_name,
              p.last_name,
              c.email,
              mr.name            AS role_name,
              ts.damage_type_id,
              dt.label           AS damage_label,
              dt.weight          AS damage_weight,
              ts.category_id,
              cat.name           AS category_name
       FROM   modules.technician_specializations ts
       JOIN   users.profiles                     p   ON p.id  = ts.user_id
       JOIN   auth.credentials                   c   ON c.user_id = p.id
       JOIN   modules.user_module_roles           umr ON umr.user_id  = ts.user_id
                                                    AND umr.module_id = ts.module_id
                                                    AND umr.is_active = true
       JOIN   modules.module_roles                mr  ON mr.id = umr.role_id
       LEFT JOIN tickets.damage_types             dt  ON dt.id = ts.damage_type_id
       LEFT JOIN modules.categories               cat ON cat.id = ts.category_id
       WHERE  ts.module_id = $1 AND ts.is_active = true
       ORDER  BY p.first_name, p.last_name, dt.label NULLS LAST, cat.name NULLS LAST`,
      [moduleId],
    );

    // Group by user
    const techMap = new Map<string, any>();
    for (const r of rows) {
      if (!techMap.has(r.user_id)) {
        techMap.set(r.user_id, {
          user_id: r.user_id,
          name: `${r.first_name} ${r.last_name}`.trim(),
          email: r.email,
          role_name: r.role_name,
          damage_types: [],
          categories: [],
        });
      }
      const entry = techMap.get(r.user_id)!;
      if (r.damage_type_id) {
        entry.damage_types.push({ spec_id: r.spec_id, id: r.damage_type_id, label: r.damage_label, weight: r.damage_weight });
      }
      if (r.category_id) {
        entry.categories.push({ spec_id: r.spec_id, id: r.category_id, name: r.category_name });
      }
    }
    return Array.from(techMap.values());
  }

  async addSpecialization(moduleId: string, dto: {
    user_id:        string;
    damage_type_id?: string | null;
    category_id?:   string | null;
  }) {
    if (!dto.damage_type_id && !dto.category_id) {
      throw new BadRequestException('Se requiere damage_type_id o category_id');
    }
    // Verify user belongs to this module as tech/jefe
    const [member] = await this.db.query<{ user_id: string }[]>(
      `SELECT umr.user_id FROM modules.user_module_roles umr
       JOIN modules.module_roles mr ON mr.id = umr.role_id
       WHERE umr.user_id = $1 AND umr.module_id = $2 AND umr.is_active = true
         AND mr.name IN ('tecnico', 'jefe_tecnico')`,
      [dto.user_id, moduleId],
    );
    if (!member) throw new BadRequestException('El usuario no es técnico activo de este módulo');

    const [row] = await this.db.query<{ id: string }[]>(
      `INSERT INTO modules.technician_specializations
         (user_id, module_id, damage_type_id, category_id)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [dto.user_id, moduleId, dto.damage_type_id ?? null, dto.category_id ?? null],
    );
    return row ?? { already_exists: true };
  }

  async removeSpecialization(specId: string, moduleId: string) {
    const result = await this.db.query(
      `DELETE FROM modules.technician_specializations
       WHERE id = $1 AND module_id = $2
       RETURNING id`,
      [specId, moduleId],
    );
    if (!(result as any[]).length) throw new NotFoundException('Especialización no encontrada');
    return { ok: true };
  }
}
