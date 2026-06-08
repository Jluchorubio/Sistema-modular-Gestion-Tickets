import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingService } from '../../shared/messaging/messaging.service';
import { CacheService } from '../../shared/redis/cache.service';
import {
  CreateStructureTypeDto, UpdateStructureTypeDto,
  CreateOrgNodeDto, UpdateOrgNodeDto,
} from './dto/org.dto';
import {
  UpdateSlaRuleDto, UpdateCompanyDto,
  UpdateDamageTypeDto, UpsertBusinessHourDto, CreateHolidayDto,
  CreateTicketCategoryDto, CreateDamageTypeDto,
} from './dto/config.dto';
import { BulkImportUsersDto } from './dto/bulk-import.dto';

const TTL = {
  ORG_TREE:          5 * 60_000,
  ORG_TYPES:         5 * 60_000,
  DAMAGE_TYPES:      5 * 60_000,
  TICKET_CATEGORIES: 10 * 60_000,
  REQUEST_TYPES:     5 * 60_000,
  PRIORITY_FORMULA:  2 * 60_000,
} as const;

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly cache: CacheService,
    private readonly messaging: MessagingService,
  ) {}

  /* ── Company info ──────────────────────────────────────────────── */

  async getCompany() {
    const [org] = await this.db.query<any[]>(
      `SELECT id, name, slug, timezone, language, logo_url, primary_color,
              website, contact_email, contact_phone, created_at, updated_at
       FROM users.organizations
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    return org ?? null;
  }

  async updateCompany(dto: UpdateCompanyDto) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;

    const map: [keyof UpdateCompanyDto, string][] = [
      ['name', 'name'], ['timezone', 'timezone'], ['language', 'language'],
      ['logo_url', 'logo_url'], ['primary_color', 'primary_color'],
      ['website', 'website'], ['contact_email', 'contact_email'],
      ['contact_phone', 'contact_phone'],
    ];

    for (const [key, col] of map) {
      if (dto[key] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(dto[key]);
      }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');

    fields.push(`updated_at = now()`);
    const [org] = await this.db.query<any[]>(
      `UPDATE users.organizations SET ${fields.join(', ')}
       WHERE id = '00000000-0000-0000-0000-000000000001'
       RETURNING *`,
      values,
    );

    this.messaging.emit('config.company.updated', {
      name:          org.name,
      slug:          org.slug,
      logo_url:      org.logo_url,
      primary_color: org.primary_color,
      timezone:      org.timezone,
      language:      org.language,
    });

    return org;
  }

  async initializeSystem() {
    await this.db.query(
      `UPDATE users.organizations SET is_initialized = true, updated_at = now()
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    return { ok: true };
  }

  /* ── SLA rules ─────────────────────────────────────────────────── */

  async getSlaRules() {
    return this.db.query<any[]>(
      `SELECT id, request_type, priority, hours_to_resolve, hours_to_first_response, is_active
       FROM config.sla_rules
       ORDER BY COALESCE(request_type, 'zzz'), priority`,
    );
  }

  async getSlaRuleById(id: string) {
    const [row] = await this.db.query<any[]>(
      `SELECT id, request_type, priority, hours_to_resolve, hours_to_first_response FROM config.sla_rules WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async updateSlaRule(id: string, dto: UpdateSlaRuleDto) {
    const [rule] = await this.db.query<any[]>(
      `UPDATE config.sla_rules
       SET hours_to_resolve        = $1,
           hours_to_first_response = $2,
           updated_at              = now()
       WHERE id = $3
       RETURNING *`,
      [dto.hours_to_resolve, dto.hours_to_first_response ?? 1, id],
    );
    if (!rule) throw new NotFoundException(`Regla SLA ${id} no encontrada`);
    return rule;
  }

  /* ── Priority rules ────────────────────────────────────────────── */

  async getPriorityRules() {
    return this.db.query<any[]>(
      `SELECT id, request_type, base_priority, position_level_min, elevated_priority, notes, is_active
       FROM config.priority_rules
       ORDER BY request_type`,
    );
  }

  /* ── Bulk user import ──────────────────────────────────────────── */

  async bulkImportUsers(dto: BulkImportUsersDto) {
    const results: { email: string; status: 'created' | 'exists' | 'error'; detail?: string }[] = [];

    for (const row of dto.users) {
      try {
        const [existing] = await this.db.query<{ id: string }[]>(
          `SELECT id FROM auth.credentials WHERE email = $1`,
          [row.email.toLowerCase()],
        );
        if (existing) { results.push({ email: row.email, status: 'exists' }); continue; }

        // Resolve org_node_id (sede by name)
        let orgNodeId: string | null = null;
        if (row.headquarters_name) {
          const [n] = await this.db.query<{ id: string }[]>(
            `SELECT n.id FROM org.nodes n
             JOIN org.structure_types t ON t.id = n.type_id
             WHERE n.name ILIKE $1 AND t.slug = 'sede' AND n.is_active = TRUE LIMIT 1`,
            [row.headquarters_name],
          );
          orgNodeId = n?.id ?? null;
        }

        // Resolve position_node_id (cargo by name)
        let posNodeId: string | null = null;
        if (row.position_name) {
          const [n] = await this.db.query<{ id: string }[]>(
            `SELECT n.id FROM org.nodes n
             JOIN org.structure_types t ON t.id = n.type_id
             WHERE n.name ILIKE $1 AND t.slug = 'cargo' AND n.is_active = TRUE LIMIT 1`,
            [row.position_name],
          );
          posNodeId = n?.id ?? null;
        }

        let globalRoleId: string | null = null;
        if (row.global_role_name) {
          const [gr] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM config.global_roles WHERE name ILIKE $1 AND is_active = TRUE LIMIT 1`,
            [row.global_role_name],
          );
          globalRoleId = gr?.id ?? null;
        }

        const qr = this.db.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
          const userId = ((await qr.query(
            `INSERT INTO users.profiles
               (first_name, last_name, display_email, phone, job_title, department,
                primary_sede, org_node_id, position_node_id, global_role_id, username)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id`,
            [
              row.first_name, row.last_name, row.email.toLowerCase(),
              row.phone ?? null, row.job_title ?? null,
              row.department ?? null, row.primary_sede ?? row.headquarters_name ?? null,
              orgNodeId, posNodeId, globalRoleId,
              row.username ?? row.email.split('@')[0],
            ],
          )) as { id: string }[])[0].id;

          await qr.query(
            `INSERT INTO auth.credentials (user_id, email) VALUES ($1, $2)`,
            [userId, row.email.toLowerCase()],
          );

          await qr.commitTransaction();
          results.push({ email: row.email, status: 'created' });
        } catch (txErr: any) {
          await qr.rollbackTransaction();
          throw txErr;
        } finally {
          await qr.release();
        }
      } catch (err: any) {
        results.push({ email: row.email, status: 'error', detail: err?.message });
      }
    }

    const created = results.filter(r => r.status === 'created').length;
    const exists  = results.filter(r => r.status === 'exists').length;
    const errors  = results.filter(r => r.status === 'error').length;
    return { summary: { created, exists, errors, total: dto.users.length }, results };
  }

  /* ── Org summary (for config dashboard) ───────────────────────── */

  async getOrgSummary() {
    const rows = await this.db.query<{ slug: string; cnt: string }[]>(
      `SELECT t.slug, count(n.id)::int AS cnt
       FROM org.structure_types t
       LEFT JOIN org.nodes n ON n.type_id = t.id AND n.is_active = TRUE
       GROUP BY t.slug`,
    );
    const bySlug = Object.fromEntries(rows.map(r => [r.slug, Number(r.cnt)]));
    return {
      headquarters: bySlug['sede']         ?? 0,
      departments:  bySlug['departamento'] ?? 0,
      areas:        bySlug['area']         ?? 0,
      positions:    bySlug['cargo']        ?? 0,
      total:        rows.reduce((s, r) => s + Number(r.cnt), 0),
    };
  }

  /* ── Request type config ───────────────────────────────────────── */

  async getRequestTypes(onlyActive = false) {
    const key = `sys:request-types:${onlyActive}`;
    return this.cache.wrap(key, TTL.REQUEST_TYPES, () => {
      const where = onlyActive ? `WHERE is_active = TRUE` : '';
      return this.db.query<any[]>(
        `SELECT id, type_key, label, description, is_active,
                requires_module, allows_manual_priority, sort_order
         FROM config.request_type_config
         ${where}
         ORDER BY sort_order`,
      );
    });
  }

  async getRequestTypeById(id: string) {
    const [row] = await this.db.query<any[]>(
      `SELECT id, type_key, label, is_active, sort_order FROM config.request_type_config WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async updateRequestType(id: string, dto: {
    label?: string; description?: string; is_active?: boolean;
    requires_module?: boolean; allows_manual_priority?: boolean; sort_order?: number;
  }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    const map: [string, string][] = [
      ['label','label'], ['description','description'], ['is_active','is_active'],
      ['requires_module','requires_module'], ['allows_manual_priority','allows_manual_priority'],
      ['sort_order','sort_order'],
    ];
    for (const [k, col] of map) {
      if ((dto as any)[k] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push((dto as any)[k]);
      }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [row] = await this.db.query<any[]>(
      `UPDATE config.request_type_config SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) throw new NotFoundException(`Tipo ${id} no encontrado`);
    await this.cache.delByPrefix('sys:request-types:');
    return row;
  }

  /* Validar que un type_key exista y esté activo (usado por RequestsService) */
  async isRequestTypeActive(typeKey: string): Promise<boolean> {
    const [row] = await this.db.query<{ is_active: boolean }[]>(
      `SELECT is_active FROM config.request_type_config WHERE type_key = $1`,
      [typeKey],
    );
    return row?.is_active === true;
  }

  /* ── Ticket categories (catálogo global, lectura pública) ─────────── */

  async getTicketCategories() {
    return this.cache.wrap('sys:ticket-categories', TTL.TICKET_CATEGORIES, () =>
      this.db.query<any[]>(
        `SELECT id, slug, label, description, icon, color, sort_order
         FROM config.ticket_categories
         WHERE is_active = TRUE
         ORDER BY sort_order`,
      ),
    );
  }

  async getTicketCategoriesAll() {
    return this.db.query<any[]>(
      `SELECT id, slug, label, description, icon, color, sort_order, is_active
       FROM config.ticket_categories
       ORDER BY sort_order`,
    );
  }

  async createTicketCategory(dto: CreateTicketCategoryDto) {
    const slug = dto.label.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const existing = await this.db.query<any[]>(
      `SELECT id FROM config.ticket_categories WHERE slug = $1`,
      [slug],
    );
    if (existing.length > 0) throw new BadRequestException(`Ya existe una categoría con ese nombre`);
    const [row] = await this.db.query<any[]>(
      `INSERT INTO config.ticket_categories (slug, label, description, sort_order, is_active)
       VALUES ($1, $2, $3,
         COALESCE($4, (SELECT COALESCE(MAX(sort_order), 0) + 10 FROM config.ticket_categories)),
         TRUE)
       RETURNING *`,
      [slug, dto.label.trim(), dto.description ?? null, dto.sort_order ?? null],
    );
    await this.cache.delByPrefix('sys:ticket-categories');
    await this.cache.delByPrefix('sys:damage-types:');
    return row;
  }

  /* ── Damage types (lectura pública, filtrable por category_id) ────── */

  async getDamageTypesAdmin() {
    return this.db.query<any[]>(
      `SELECT dt.id, dt.category_id, tc.slug AS category_slug, tc.label AS category_label,
              dt.slug, dt.label, dt.description,
              dt.default_priority, dt.weight, dt.allow_freetext, dt.is_other, dt.is_active, dt.sort_order
       FROM tickets.damage_types dt
       JOIN config.ticket_categories tc ON tc.id = dt.category_id
       ORDER BY tc.sort_order, dt.sort_order`,
    );
  }

  async createDamageType(dto: CreateDamageTypeDto) {
    const slug = dto.label.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.damage_types
         (category_id, slug, label, description, default_priority, weight, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, $6,
         COALESCE($7, (SELECT COALESCE(MAX(sort_order), 0) + 10
                       FROM tickets.damage_types WHERE category_id = $1)),
         TRUE)
       RETURNING *`,
      [dto.category_id, slug, dto.label.trim(), dto.description ?? null,
       dto.default_priority, dto.weight, dto.sort_order ?? null],
    );
    await this.cache.delByPrefix('sys:damage-types:');
    return row;
  }

  async getDamageTypes(categoryId?: string) {
    const key = `sys:damage-types:${categoryId ?? 'all'}`;
    return this.cache.wrap(key, TTL.DAMAGE_TYPES, () => {
      const where  = categoryId ? `AND dt.category_id = $1` : '';
      const params = categoryId ? [categoryId] : [];
      return this.db.query<any[]>(
        `SELECT dt.id, dt.category_id, tc.slug AS category_slug, tc.label AS category_label,
                dt.slug, dt.label, dt.description,
                dt.default_priority, dt.weight, dt.allow_freetext, dt.is_other, dt.sort_order
         FROM tickets.damage_types dt
         JOIN config.ticket_categories tc ON tc.id = dt.category_id
         WHERE dt.is_active = TRUE ${where}
         ORDER BY tc.sort_order, dt.sort_order`,
        params,
      );
    });
  }

  async getDamageTypeById(id: string) {
    const [row] = await this.db.query<any[]>(
      `SELECT id, slug, label, weight, is_active FROM tickets.damage_types WHERE id = $1`,
      [id],
    );
    return row ?? null;
  }

  async updateDamageType(id: string, dto: UpdateDamageTypeDto) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    if (dto.is_active !== undefined) { fields.push(`is_active = $${idx++}`); values.push(dto.is_active); }
    if (dto.weight    !== undefined) { fields.push(`weight = $${idx++}`);    values.push(dto.weight); }
    if (dto.label     !== undefined) { fields.push(`label = $${idx++}`);     values.push(dto.label); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.damage_types SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) throw new NotFoundException(`Tipo de daño ${id} no encontrado`);
    await this.cache.delByPrefix('sys:damage-types:');
    return row;
  }

  /* ── Business hours ──────────────────────────────────────────────── */

  async getBusinessHours(moduleId?: string) {
    const where = moduleId ? `WHERE module_id = $1` : `WHERE module_id IS NULL`;
    const params = moduleId ? [moduleId] : [];
    return this.db.query<any[]>(
      `SELECT id, module_id, day_of_week, start_time, end_time, is_active
       FROM config.business_hours ${where}
       ORDER BY day_of_week`,
      params,
    );
  }

  async upsertBusinessHour(dto: UpsertBusinessHourDto) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO config.business_hours (module_id, day_of_week, start_time, end_time, is_active)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (module_id, day_of_week) DO UPDATE
         SET start_time = EXCLUDED.start_time,
             end_time   = EXCLUDED.end_time,
             is_active  = EXCLUDED.is_active,
             updated_at = now()
       RETURNING *`,
      [dto.module_id ?? null, dto.day_of_week, dto.start_time, dto.end_time, dto.is_active ?? true],
    );
    return row;
  }

  /* ── Holidays ────────────────────────────────────────────────────── */

  async getHolidays(moduleId?: string) {
    const where = moduleId ? `WHERE module_id = $1 OR module_id IS NULL` : `WHERE module_id IS NULL`;
    const params = moduleId ? [moduleId] : [];
    return this.db.query<any[]>(
      `SELECT id, module_id, holiday_date, name, is_active
       FROM config.holidays ${where}
       ORDER BY holiday_date`,
      params,
    );
  }

  async createHoliday(dto: CreateHolidayDto) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO config.holidays (module_id, holiday_date, name)
       VALUES ($1, $2, $3)
       ON CONFLICT (module_id, holiday_date) DO UPDATE SET name = EXCLUDED.name, is_active = TRUE, updated_at = now()
       RETURNING *`,
      [dto.module_id ?? null, dto.holiday_date, dto.name],
    );
    return row;
  }

  async deleteHoliday(id: string) {
    await this.db.query(
      `UPDATE config.holidays SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  async syncColombiaHolidays(year: number): Promise<{ synced: number; skipped: number }> {
    const url  = `https://date.nager.at/api/v3/PublicHolidays/${year}/CO`;
    const res  = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`Nager.Date responded ${res.status}`);

    const holidays: { date: string; localName: string }[] = await res.json();
    if (!Array.isArray(holidays) || !holidays.length) return { synced: 0, skipped: 0 };

    let synced = 0;
    let skipped = 0;
    for (const h of holidays) {
      if (!h.date || !h.localName) { skipped++; continue; }
      await this.db.query(
        `INSERT INTO config.holidays (module_id, holiday_date, name)
         VALUES (NULL, $1, $2)
         ON CONFLICT (module_id, holiday_date)
           DO UPDATE SET name = EXCLUDED.name, is_active = TRUE, updated_at = now()`,
        [h.date, h.localName],
      );
      synced++;
    }
    return { synced, skipped };
  }

  /* ── Ticket SLA Policies (per-module) ───────────────────────────── */

  async getTicketSlaPolicies(moduleId: string) {
    const policies = await this.db.query<any[]>(
      `SELECT id, module_id, name, version, is_active
       FROM tickets.sla_policies WHERE module_id = $1 ORDER BY version DESC`,
      [moduleId],
    );

    const rules = await this.db.query<any[]>(
      `SELECT r.id, r.policy_id, r.name, r.priority_result, r.hours_to_resolve,
              r.sort_order, r.is_active
       FROM tickets.sla_rules r
       JOIN tickets.sla_policies p ON p.id = r.policy_id
       WHERE p.module_id = $1 AND r.is_active = TRUE
       ORDER BY r.sort_order, r.created_at`,
      [moduleId],
    );

    const conditions = rules.length
      ? await this.db.query<any[]>(
          `SELECT id, rule_id, field, operator, value, logical_group, sort_order
           FROM tickets.sla_conditions
           WHERE rule_id = ANY($1)
           ORDER BY logical_group, sort_order`,
          [rules.map((r) => r.id)],
        )
      : [];

    return policies.map((p) => ({
      ...p,
      rules: rules
        .filter((r) => r.policy_id === p.id)
        .map((r) => ({
          ...r,
          conditions: conditions.filter((c) => c.rule_id === r.id),
        })),
    }));
  }

  async createTicketSlaRule(policyId: string, dto: {
    name: string;
    priority_result: string;
    hours_to_resolve: number;
    sort_order?: number;
  }) {
    const [policy] = await this.db.query<any[]>(
      `SELECT id FROM tickets.sla_policies WHERE id = $1`,
      [policyId],
    );
    if (!policy) throw new NotFoundException(`Política SLA ${policyId} no encontrada`);

    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.sla_rules (policy_id, name, priority_result, hours_to_resolve, sort_order, is_active)
       VALUES ($1, $2, $3, $4, $5, TRUE)
       RETURNING *`,
      [policyId, dto.name, dto.priority_result, dto.hours_to_resolve, dto.sort_order ?? 10],
    );
    return { ...row, conditions: [] };
  }

  async getTicketSlaRuleById(ruleId: string) {
    const [row] = await this.db.query<any[]>(
      `SELECT id, policy_id, name, priority_result, hours_to_resolve, sort_order, is_active
       FROM tickets.sla_rules WHERE id = $1`,
      [ruleId],
    );
    return row ?? null;
  }

  async updateTicketSlaRule(ruleId: string, dto: {
    name?: string;
    priority_result?: string;
    hours_to_resolve?: number;
    is_active?: boolean;
    sort_order?: number;
  }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    const map: [string, string][] = [
      ['name','name'],['priority_result','priority_result'],
      ['hours_to_resolve','hours_to_resolve'],['is_active','is_active'],['sort_order','sort_order'],
    ];
    for (const [k, col] of map) {
      if ((dto as any)[k] !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push((dto as any)[k]);
      }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(ruleId);
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.sla_rules SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) throw new NotFoundException(`Regla SLA ${ruleId} no encontrada`);
    return row;
  }

  async deleteTicketSlaRule(ruleId: string) {
    await this.db.query(
      `UPDATE tickets.sla_rules SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [ruleId],
    );
    return { ok: true };
  }

  async createTicketSlaCondition(ruleId: string, dto: {
    field: string;
    operator: string;
    value: string;
    logical_group?: number;
  }) {
    const [rule] = await this.db.query<any[]>(
      `SELECT id FROM tickets.sla_rules WHERE id = $1 AND is_active = TRUE`,
      [ruleId],
    );
    if (!rule) throw new NotFoundException(`Regla SLA ${ruleId} no encontrada`);

    const [row] = await this.db.query<any[]>(
      `INSERT INTO tickets.sla_conditions (rule_id, field, operator, value, logical_group)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [ruleId, dto.field, dto.operator, dto.value, dto.logical_group ?? 1],
    );
    return row;
  }

  async deleteTicketSlaCondition(condId: string) {
    await this.db.query(`DELETE FROM tickets.sla_conditions WHERE id = $1`, [condId]);
    return { ok: true };
  }

  /* ── Dynamic org: structure types ──────────────────────────────────────── */

  async getStructureTypes(onlyActive = false) {
    const key = `org:structure-types:${onlyActive}`;
    return this.cache.wrap(key, TTL.ORG_TYPES, () => {
      const where = onlyActive
        ? `WHERE is_active = TRUE AND deleted_at IS NULL`
        : `WHERE deleted_at IS NULL`;
      return this.db.query<any[]>(
        `SELECT id, name, slug, description, weight, parent_type_id, allows_users, is_active, sort_order, icon, color
         FROM org.structure_types ${where}
         ORDER BY sort_order, name`,
      );
    });
  }

  async deleteStructureType(id: string) {
    const [type] = await this.db.query<{ id: string; name: string }[]>(
      `SELECT id, name FROM org.structure_types WHERE id = $1 AND deleted_at IS NULL`, [id],
    );
    if (!type) throw new NotFoundException(`Tipo de estructura ${id} no encontrado`);

    const [inUse] = await this.db.query<{ cnt: string }[]>(
      `SELECT COUNT(*)::text AS cnt FROM org.nodes WHERE type_id = $1 AND is_active = TRUE`, [id],
    );
    if (parseInt(inUse?.cnt ?? '0') > 0) {
      throw new BadRequestException('No se puede eliminar: existen nodos usando este tipo. Desactívalo en su lugar.');
    }

    await this.db.query(
      `UPDATE org.structure_types
       SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days', is_active = false
       WHERE id = $1`,
      [id],
    );
    await this.cache.delByPrefix('org:structure-types:');
    return { ok: true, message: `Tipo "${type.name}" enviado a la papelera` };
  }

  async createStructureType(dto: CreateStructureTypeDto) {
    const [exists] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM org.structure_types WHERE slug = $1`, [dto.slug],
    );
    if (exists) throw new BadRequestException(`Ya existe un tipo con slug '${dto.slug}'`);

    const [row] = await this.db.query<any[]>(
      `INSERT INTO org.structure_types (name, slug, description, weight, parent_type_id, allows_users, sort_order, icon, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [dto.name, dto.slug, dto.description ?? null, dto.weight ?? 5,
       dto.parent_type_id ?? null, dto.allows_users ?? true, dto.sort_order ?? 10,
       dto.icon ?? 'folder', dto.color ?? '#64748b'],
    );
    await this.cache.delByPrefix('org:structure-types:');
    return row;
  }

  async updateStructureType(id: string, dto: UpdateStructureTypeDto) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    const map: [keyof UpdateStructureTypeDto, string][] = [
      ['name','name'],['description','description'],['weight','weight'],
      ['parent_type_id','parent_type_id'],['allows_users','allows_users'],
      ['is_active','is_active'],['sort_order','sort_order'],
      ['icon','icon'],['color','color'],
    ];
    for (const [k, col] of map) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${idx++}`); values.push(dto[k]); }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [row] = await this.db.query<any[]>(
      `UPDATE org.structure_types SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values,
    );
    if (!row) throw new NotFoundException(`Tipo de estructura ${id} no encontrado`);
    await this.cache.delByPrefix('org:structure-types:');
    return row;
  }

  /* ── Dynamic org: nodes ─────────────────────────────────────────────────── */

  async getOrgNodesBySlug(slug: string): Promise<{ id: string; name: string; parent_id: string | null; parent_name: string | null }[]> {
    return this.db.query<any[]>(
      `SELECT n.id, n.name, n.parent_id, p.name AS parent_name
       FROM   org.nodes n
       JOIN   org.structure_types t ON t.id = n.type_id
       LEFT JOIN org.nodes p ON p.id = n.parent_id
       WHERE  t.slug = $1 AND n.is_active = TRUE
       ORDER  BY n.sort_order, n.name`,
      [slug],
    );
  }

  async getOrgNodes(params: { type_id?: string; parent_id?: string; active_only?: boolean }) {
    const conditions: string[] = [];
    const values: any[]        = [];
    let idx = 1;
    if (params.type_id)    { conditions.push(`n.type_id  = $${idx++}`); values.push(params.type_id); }
    if (params.parent_id)  { conditions.push(`n.parent_id = $${idx++}`); values.push(params.parent_id); }
    if (params.active_only) conditions.push(`n.is_active = TRUE`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.query<any[]>(
      `SELECT n.id, n.type_id, t.name AS type_name, t.slug AS type_slug,
              n.parent_id, p.name AS parent_name,
              n.name, n.code, n.description, n.weight,
              n.address, n.city, n.country, n.phone, n.email,
              n.is_active, n.sort_order, n.created_at,
              (SELECT count(*) FROM org.nodes c WHERE c.parent_id = n.id AND c.is_active = TRUE)::int AS child_count,
              (SELECT count(*) FROM users.profiles u WHERE u.org_node_id = n.id)::int AS user_count
       FROM org.nodes n
       JOIN org.structure_types t ON t.id = n.type_id
       LEFT JOIN org.nodes p ON p.id = n.parent_id
       ${where}
       ORDER BY t.sort_order, n.sort_order, n.name`,
      values,
    );
  }

  async getOrgNodeTree() {
    return this.cache.wrap('org:tree', TTL.ORG_TREE, async () => {
      const nodes = await this.db.query<any[]>(
        `SELECT n.id, n.type_id, t.name AS type_name, t.slug AS type_slug,
                n.parent_id, p.name AS parent_name,
                n.name, n.code, n.description, n.weight,
                n.is_active, n.sort_order,
                (SELECT count(*) FROM users.profiles u WHERE u.org_node_id = n.id)::int AS user_count,
                (SELECT count(*) FROM org.nodes c WHERE c.parent_id = n.id AND c.is_active = TRUE)::int AS child_count
         FROM org.nodes n
         JOIN org.structure_types t ON t.id = n.type_id
         LEFT JOIN org.nodes p ON p.id = n.parent_id
         WHERE n.is_active = TRUE
         ORDER BY t.sort_order, n.sort_order, n.name`,
      );
      const map = new Map<string, any>(nodes.map(n => [n.id, { ...n, children: [] }]));
      const roots: any[] = [];
      for (const node of map.values()) {
        if (node.parent_id && map.has(node.parent_id)) {
          map.get(node.parent_id)!.children.push(node);
        } else {
          roots.push(node);
        }
      }
      return roots;
    });
  }

  async createOrgNode(dto: CreateOrgNodeDto) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO org.nodes
         (type_id, parent_id, name, code, description, weight, address, city, country, phone, email, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING *`,
      [dto.type_id, dto.parent_id ?? null, dto.name, dto.code ?? null,
       dto.description ?? null, dto.weight ?? 5,
       dto.address ?? null, dto.city ?? null, dto.country ?? null,
       dto.phone ?? null, dto.email ?? null, dto.sort_order ?? 10],
    );
    await this.cache.del('org:tree');
    return row;
  }

  async updateOrgNode(id: string, dto: UpdateOrgNodeDto) {
    if (dto.parent_id !== undefined && dto.parent_id !== null) {
      if (dto.parent_id === id)
        throw new BadRequestException('Un nodo no puede ser su propio padre');
      const [{ is_circular }] = await this.db.query<{ is_circular: boolean }[]>(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM org.nodes WHERE parent_id = $1
           UNION ALL
           SELECT n.id FROM org.nodes n JOIN descendants d ON n.parent_id = d.id
         )
         SELECT EXISTS(SELECT 1 FROM descendants WHERE id = $2) AS is_circular`,
        [id, dto.parent_id],
      );
      if (is_circular)
        throw new BadRequestException('Referencia circular: el nuevo padre es descendiente del nodo');
    }

    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    const map: [keyof UpdateOrgNodeDto, string][] = [
      ['parent_id','parent_id'],['name','name'],['code','code'],['description','description'],
      ['weight','weight'],['address','address'],['city','city'],['country','country'],
      ['phone','phone'],['email','email'],['is_active','is_active'],['sort_order','sort_order'],
    ];
    for (const [k, col] of map) {
      if (dto[k] !== undefined) { fields.push(`${col} = $${idx++}`); values.push(dto[k]); }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    values.push(id);
    const [row] = await this.db.query<any[]>(
      `UPDATE org.nodes SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values,
    );
    if (!row) throw new NotFoundException(`Nodo org ${id} no encontrado`);
    await this.cache.del('org:tree');
    return row;
  }

  async deleteOrgNode(id: string) {
    const [children] = await this.db.query<{ count: string }[]>(
      `SELECT count(*)::int AS count FROM org.nodes WHERE parent_id = $1 AND is_active = TRUE`, [id],
    );
    if (Number(children.count) > 0)
      throw new BadRequestException('Este nodo tiene nodos hijos activos. Desactívalos primero.');
    await this.db.query(
      `UPDATE org.nodes SET is_active = FALSE, updated_at = now() WHERE id = $1`, [id],
    );
    await this.cache.del('org:tree');
    return { ok: true };
  }

  /* ── Priority formula config ─────────────────────────────────────────────── */

  async getPriorityFormula() {
    return this.cache.wrap('sys:priority-formula', TTL.PRIORITY_FORMULA, async () => {
      const [row] = await this.db.query<any[]>(
        `SELECT id, w_cargo, w_nodo, w_daño, threshold_critica, threshold_alta, threshold_media, description, is_active
         FROM config.priority_formula WHERE is_active = TRUE LIMIT 1`,
      );
      return row ?? null;
    });
  }

  async updatePriorityFormula(dto: {
    w_cargo?:           number;
    w_nodo?:            number;
    w_daño?:            number;
    threshold_critica?: number;
    threshold_alta?:    number;
    threshold_media?:   number;
    description?:       string;
  }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    const map: [string, string][] = [
      ['w_cargo','w_cargo'], ['w_nodo','w_nodo'], ['w_daño','w_daño'],
      ['threshold_critica','threshold_critica'], ['threshold_alta','threshold_alta'],
      ['threshold_media','threshold_media'], ['description','description'],
    ];
    for (const [k, col] of map) {
      if ((dto as any)[k] !== undefined) { fields.push(`${col} = $${idx++}`); values.push((dto as any)[k]); }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push(`updated_at = now()`);
    const [row] = await this.db.query<any[]>(
      `UPDATE config.priority_formula SET ${fields.join(', ')} WHERE is_active = TRUE RETURNING *`,
      values,
    );
    await this.cache.del('sys:priority-formula');
    return row;
  }

  async previewPriority(dto: {
    peso_cargo: number;
    peso_nodo:  number;
    peso_daño:  number;
    urgency?:   string;
    impact?:    string;
  }) {
    const URGENCY: Record<string, number> = { urgente: 1.5, alta: 1.0, media: 0.5, baja: 0 };
    const IMPACT:  Record<string, number> = { critico: 1.5, alto: 1.0, medio: 0.5, bajo: 0 };

    const formula = await this.getPriorityFormula();
    const w_cargo = formula?.w_cargo ?? 0.25;
    const w_nodo  = formula?.w_nodo  ?? 0.35;
    const w_daño  = formula?.w_daño  ?? 0.40;
    const t_c = formula?.threshold_critica ?? 9;
    const t_a = formula?.threshold_alta    ?? 7;
    const t_m = formula?.threshold_media   ?? 5;

    const ub = URGENCY[dto.urgency ?? 'media'] ?? 0.5;
    const ib = IMPACT [dto.impact  ?? 'medio'] ?? 0.5;

    const base  = dto.peso_cargo * w_cargo + dto.peso_nodo * w_nodo + dto.peso_daño * w_daño;
    const score = base + ub + ib;
    const priority = score >= t_c ? 'critica' : score >= t_a ? 'alta' : score >= t_m ? 'media' : 'baja';

    return {
      score:    Math.round(score * 100) / 100,
      base:     Math.round(base  * 100) / 100,
      priority,
      urgency_bonus: ub,
      impact_bonus:  ib,
    };
  }

  /* ── Datos públicos de empresa (accesible a todos los usuarios autenticados) */
  async getPublicCompanyInfo() {
    const [org] = await this.db.query<any[]>(
      `SELECT name, slug, logo_url, primary_color, timezone, language
       FROM users.organizations
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    return org ?? { name: 'Mi Empresa', logo_url: null, primary_color: '#6366f1' };
  }
}
