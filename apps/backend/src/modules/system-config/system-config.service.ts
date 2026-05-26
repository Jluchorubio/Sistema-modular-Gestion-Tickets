import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CreateHeadquarterDto, UpdateHeadquarterDto,
  CreateDepartmentDto, CreateAreaDto, CreatePositionDto,
} from './dto/org.dto';
import {
  UpdateSlaRuleDto, UpdateCompanyDto,
  UpdateDamageTypeDto, UpsertBusinessHourDto, CreateHolidayDto,
} from './dto/config.dto';
import { BulkImportUsersDto } from './dto/bulk-import.dto';

@Injectable()
export class SystemConfigService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /* ── Company info ──────────────────────────────────────────────── */

  async getCompany() {
    const [org] = await this.db.query<any[]>(
      `SELECT id, name, slug, timezone, language, logo_url, primary_color,
              website, contact_email, contact_phone, fiscal_id, industry,
              employee_count, created_at, updated_at
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
      ['contact_phone', 'contact_phone'], ['fiscal_id', 'fiscal_id'],
      ['industry', 'industry'], ['employee_count', 'employee_count'],
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
    return org;
  }

  async initializeSystem() {
    await this.db.query(
      `UPDATE users.organizations SET is_initialized = true, updated_at = now()
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    return { ok: true };
  }

  /* ── Headquarters ──────────────────────────────────────────────── */

  async getHeadquarters() {
    return this.db.query<any[]>(
      `SELECT id, name, address, city, country, phone, email, is_active, created_at
       FROM org.headquarters WHERE is_active = TRUE ORDER BY name`,
    );
  }

  async createHeadquarter(dto: CreateHeadquarterDto) {
    const [existing] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM org.headquarters WHERE name = $1`,
      [dto.name],
    );
    if (existing) throw new BadRequestException(`Ya existe una sede con ese nombre`);

    const [hq] = await this.db.query<any[]>(
      `INSERT INTO org.headquarters (name, address, city, country, phone, email)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [dto.name, dto.address ?? null, dto.city ?? null,
       dto.country ?? 'Colombia', dto.phone ?? null, dto.email ?? null],
    );
    return hq;
  }

  async updateHeadquarter(id: string, dto: UpdateHeadquarterDto) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;
    const cols: (keyof UpdateHeadquarterDto)[] = ['name','address','city','country','phone','email'];
    for (const col of cols) {
      if (dto[col] !== undefined) { fields.push(`${col} = $${idx++}`); values.push(dto[col]); }
    }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');
    fields.push('updated_at = now()');
    values.push(id);
    const [hq] = await this.db.query<any[]>(
      `UPDATE org.headquarters SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!hq) throw new NotFoundException(`Sede ${id} no encontrada`);
    return hq;
  }

  async deleteHeadquarter(id: string) {
    await this.db.query(
      `UPDATE org.headquarters SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  /* ── Departments ───────────────────────────────────────────────── */

  async getDepartments() {
    return this.db.query<any[]>(
      `SELECT d.id, d.name, d.description, d.is_active,
              COUNT(a.id) AS area_count
       FROM org.departments d
       LEFT JOIN org.areas a ON a.department_id = d.id AND a.is_active = TRUE
       WHERE d.is_active = TRUE
       GROUP BY d.id
       ORDER BY d.name`,
    );
  }

  async createDepartment(dto: CreateDepartmentDto) {
    const [existing] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM org.departments WHERE name = $1`,
      [dto.name],
    );
    if (existing) throw new BadRequestException(`Ya existe un departamento con ese nombre`);

    const [dept] = await this.db.query<any[]>(
      `INSERT INTO org.departments (name, description) VALUES ($1, $2) RETURNING *`,
      [dto.name, dto.description ?? null],
    );
    return dept;
  }

  async deleteDepartment(id: string) {
    await this.db.query(
      `UPDATE org.departments SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  /* ── Areas ─────────────────────────────────────────────────────── */

  async getAreas(departmentId?: string) {
    const where = departmentId ? `AND a.department_id = '${departmentId}'` : '';
    return this.db.query<any[]>(
      `SELECT a.id, a.name, a.description, a.department_id, d.name AS department_name
       FROM org.areas a
       LEFT JOIN org.departments d ON d.id = a.department_id
       WHERE a.is_active = TRUE ${where}
       ORDER BY d.name, a.name`,
    );
  }

  async createArea(dto: CreateAreaDto) {
    const [area] = await this.db.query<any[]>(
      `INSERT INTO org.areas (name, description, department_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [dto.name, dto.description ?? null, dto.department_id ?? null],
    );
    return area;
  }

  async deleteArea(id: string) {
    await this.db.query(
      `UPDATE org.areas SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  /* ── Positions ─────────────────────────────────────────────────── */

  async getPositions() {
    return this.db.query<any[]>(
      `SELECT id, name, level, description, is_active
       FROM org.positions
       WHERE is_active = TRUE
       ORDER BY level DESC, name`,
    );
  }

  async createPosition(dto: CreatePositionDto) {
    const [existing] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM org.positions WHERE name = $1`,
      [dto.name],
    );
    if (existing) throw new BadRequestException(`Ya existe un cargo con ese nombre`);

    const [pos] = await this.db.query<any[]>(
      `INSERT INTO org.positions (name, level, description) VALUES ($1, $2, $3) RETURNING *`,
      [dto.name, dto.level, dto.description ?? null],
    );
    return pos;
  }

  async deletePosition(id: string) {
    await this.db.query(
      `UPDATE org.positions SET is_active = FALSE, updated_at = now() WHERE id = $1`,
      [id],
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
        // Check if auth record already exists
        const [existing] = await this.db.query<{ id: string }[]>(
          `SELECT id FROM auth.credentials WHERE email = $1`,
          [row.email.toLowerCase()],
        );

        if (existing) {
          results.push({ email: row.email, status: 'exists' });
          continue;
        }

        // Resolve org FKs if names provided
        let hqId: string | null = null;
        if (row.headquarters_name) {
          const [hq] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM org.headquarters WHERE name ILIKE $1 AND is_active = TRUE LIMIT 1`,
            [row.headquarters_name],
          );
          hqId = hq?.id ?? null;
        }

        let posId: string | null = null;
        if (row.position_name) {
          const [pos] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM org.positions WHERE name ILIKE $1 AND is_active = TRUE LIMIT 1`,
            [row.position_name],
          );
          posId = pos?.id ?? null;
        }

        let globalRoleId: string | null = null;
        if (row.global_role_name) {
          const [gr] = await this.db.query<{ id: string }[]>(
            `SELECT id FROM config.global_roles WHERE name ILIKE $1 AND is_active = TRUE LIMIT 1`,
            [row.global_role_name],
          );
          globalRoleId = gr?.id ?? null;
        }

        // Create profile (auth handled separately by Supabase invite)
        const userId = (await this.db.query<{ id: string }[]>(
          `INSERT INTO users.profiles
             (first_name, last_name, display_email, phone, job_title, department,
              primary_sede, headquarters_id, position_id, global_role_id, username)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           RETURNING id`,
          [
            row.first_name, row.last_name, row.email.toLowerCase(),
            row.phone ?? null, row.job_title ?? null,
            row.department ?? null, row.primary_sede ?? row.headquarters_name ?? null,
            hqId, posId, globalRoleId,
            row.username ?? row.email.split('@')[0],
          ],
        ))[0].id;

        // Stub auth.credentials so user can be invited via Supabase
        await this.db.query(
          `INSERT INTO auth.credentials (user_id, email)
           VALUES ($1, $2)
           ON CONFLICT (email) DO NOTHING`,
          [userId, row.email.toLowerCase()],
        );

        results.push({ email: row.email, status: 'created' });
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
    const [[hqCount], [deptCount], [areaCount], [posCount]] = await Promise.all([
      this.db.query<{ count: string }[]>(`SELECT count(*) FROM org.headquarters WHERE is_active = TRUE`),
      this.db.query<{ count: string }[]>(`SELECT count(*) FROM org.departments WHERE is_active = TRUE`),
      this.db.query<{ count: string }[]>(`SELECT count(*) FROM org.areas WHERE is_active = TRUE`),
      this.db.query<{ count: string }[]>(`SELECT count(*) FROM org.positions WHERE is_active = TRUE`),
    ]);
    return {
      headquarters: Number(hqCount.count),
      departments:  Number(deptCount.count),
      areas:        Number(areaCount.count),
      positions:    Number(posCount.count),
    };
  }

  /* ── Request type config ───────────────────────────────────────── */

  async getRequestTypes(onlyActive = false) {
    const where = onlyActive ? `WHERE is_active = TRUE` : '';
    return this.db.query<any[]>(
      `SELECT id, type_key, label, description, is_active,
              requires_module, allows_manual_priority, sort_order
       FROM config.request_type_config
       ${where}
       ORDER BY sort_order`,
    );
  }

  async updateRequestType(id: string, dto: {
    label?: string;
    description?: string;
    is_active?: boolean;
    requires_module?: boolean;
    allows_manual_priority?: boolean;
    sort_order?: number;
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
    return this.db.query<any[]>(
      `SELECT id, slug, label, description, icon, color, sort_order
       FROM config.ticket_categories
       WHERE is_active = TRUE
       ORDER BY sort_order`,
    );
  }

  /* ── Damage types (lectura pública, filtrable por category_id) ────── */

  async getDamageTypes(categoryId?: string) {
    const where = categoryId
      ? `AND dt.category_id = $1`
      : '';
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

  /* Datos públicos de empresa (accesible a todos los usuarios autenticados) */
  async getPublicCompanyInfo() {
    const [org] = await this.db.query<any[]>(
      `SELECT name, slug, logo_url, primary_color, timezone, language
       FROM users.organizations
       WHERE id = '00000000-0000-0000-0000-000000000001'`,
    );
    return org ?? { name: 'Mi Empresa', logo_url: null, primary_color: '#6366f1' };
  }
}
