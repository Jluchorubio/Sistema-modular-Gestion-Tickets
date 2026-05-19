import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CreateHeadquarterDto, UpdateHeadquarterDto,
  CreateDepartmentDto, CreateAreaDto, CreatePositionDto,
} from './dto/org.dto';
import { UpdateSlaRuleDto, UpdateCompanyDto } from './dto/config.dto';
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
