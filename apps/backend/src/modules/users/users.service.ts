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
import * as bcrypt from 'bcrypt';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ─── CRUD usuarios ───────────────────────────────────────────────────────────

  async createUser(actorId: string, dto: CreateUserDto) {
    const normalize = (s: string) =>
      s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const baseUsername = `${normalize(dto.first_name)}_${normalize(dto.last_name)}`;
    const suffix = Math.random().toString(36).slice(2, 6);
    const autoUsername = dto.username ? dto.username.toLowerCase().trim() : `${baseUsername}_${suffix}`;
    const autoEmail = dto.email ? dto.email.toLowerCase().trim() : `${autoUsername}@temp.ticket.local`;
    const email = autoEmail;

    const [existing] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM auth.credentials WHERE email = $1`,
      [email],
    );
    if (existing) throw new ConflictException(`Email ${email} ya está registrado`);

    if (dto.is_superadmin) {
      const [actor] = await this.db.query<{ is_superadmin: boolean }[]>(
        `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
        [actorId],
      );
      if (!actor?.is_superadmin) throw new ForbiddenException('Solo superadmin puede crear otro superadmin');
    }

    const DEFAULT_PASSWORD = 'Ticket2026!';
    const passwordHash = await bcrypt.hash(dto.password ?? DEFAULT_PASSWORD, BCRYPT_ROUNDS);

    const [uConflict] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM users.profiles WHERE LOWER(username) = $1 AND deleted_at IS NULL`,
      [autoUsername],
    );
    if (uConflict) throw new ConflictException(`Nombre de usuario '${autoUsername}' ya está en uso`);

    const hasAllProfileFields = !!(dto.phone && dto.address && dto.job_title && dto.department && dto.primary_sede);

    const [profile] = await this.db.query<{ id: string }[]>(
      `INSERT INTO users.profiles
         (first_name, last_name, phone, username, address, job_title, department, primary_sede,
          is_superadmin, global_role_id, profile_complete)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
         COALESCE($10::uuid, (SELECT id FROM config.global_roles WHERE name = 'usuario')),
         $11
       )
       RETURNING id`,
      [
        dto.first_name,
        dto.last_name,
        dto.phone        ?? null,
        autoUsername,
        dto.address      ?? null,
        dto.job_title    ?? null,
        dto.department   ?? null,
        dto.primary_sede ?? null,
        dto.is_superadmin ?? false,
        dto.global_role_id ?? null,
        hasAllProfileFields,
      ],
    );

    const forcePasswordChange = !dto.email;
    try {
      await this.db.query(
        `INSERT INTO auth.credentials (user_id, email, password_hash, force_password_change)
         VALUES ($1, $2, $3, $4)`,
        [profile.id, email, passwordHash, forcePasswordChange],
      );
    } catch {
      await this.db.query(
        `INSERT INTO auth.credentials (user_id, email, password_hash)
         VALUES ($1, $2, $3)`,
        [profile.id, email, passwordHash],
      );
    }

    await this.db.query(
      `INSERT INTO users.preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
      [profile.id],
    );

    this.logger.log(`Usuario creado: ${profile.id} por actor ${actorId}`);
    return this.getUser(profile.id);
  }

  async listUsers(query: {
    search?: string;
    is_active?: boolean;
    is_superadmin?: boolean;
    page?: number;
    limit?: number;
  }) {
    const page   = Math.max(1, query.page  ?? 1);
    const limit  = Math.min(100, Math.max(1, query.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['p.deleted_at IS NULL'];
    const params: unknown[]    = [];

    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(
        `(p.first_name ILIKE $${params.length} OR p.last_name ILIKE $${params.length} OR c.email ILIKE $${params.length})`,
      );
    }
    if (query.is_active !== undefined) {
      params.push(query.is_active);
      conditions.push(`p.is_active = $${params.length}`);
    }
    if (query.is_superadmin !== undefined) {
      params.push(query.is_superadmin);
      conditions.push(`p.is_superadmin = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    params.push(limit, offset);
    const limitIdx  = params.length - 1;
    const offsetIdx = params.length;

    const rows = await this.db.query<any[]>(
      `SELECT p.id,
              p.first_name,
              p.last_name,
              p.phone,
              p.username,
              p.address,
              p.job_title,
              p.department,
              p.primary_sede,
              p.avatar_url,
              p.is_superadmin,
              p.is_active,
              p.profile_complete,
              p.created_at,
              p.last_seen_at,
              c.email,
              c.last_login_at,
              p.global_role_id,
              gr.name AS global_role,
              COALESCE(
                json_agg(
                  json_build_object(
                    'module_id', umr.module_id,
                    'module',    m.name,
                    'role_id',   umr.role_id,
                    'role',      mr.name
                  )
                ) FILTER (WHERE umr.id IS NOT NULL),
                '[]'
              ) AS roles
       FROM   users.profiles    p
       JOIN   auth.credentials  c  ON c.user_id   = p.id
       LEFT JOIN config.global_roles gr ON gr.id  = p.global_role_id
       LEFT JOIN modules.user_module_roles umr ON umr.user_id = p.id AND umr.is_active = true
       LEFT JOIN modules.modules           m   ON m.id        = umr.module_id
       LEFT JOIN modules.module_roles      mr  ON mr.id       = umr.role_id
       WHERE  ${where}
       GROUP  BY p.id, p.last_seen_at, c.email, c.last_login_at, gr.id, gr.name
       ORDER  BY p.created_at DESC
       LIMIT  $${limitIdx} OFFSET $${offsetIdx}`,
      params,
    );

    const [{ total }] = await this.db.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total
       FROM   users.profiles   p
       JOIN   auth.credentials c ON c.user_id = p.id
       WHERE  ${where}`,
      params.slice(0, params.length - 2),
    );

    return {
      data: rows,
      meta: { total: parseInt(total, 10), page, limit, pages: Math.ceil(parseInt(total, 10) / limit) },
    };
  }

  async getUser(id: string) {
    const [user] = await this.db.query<any[]>(
      `SELECT p.id,
              p.first_name,
              p.last_name,
              p.display_email,
              p.phone_prefix,
              p.phone,
              p.username,
              p.address,
              p.country,
              p.state_province,
              p.city,
              p.birth_date,
              p.national_id,
              p.gender,
              p.emergency_contact_name,
              p.emergency_contact_phone,
              p.job_title,
              p.department,
              p.primary_sede,
              p.avatar_url,
              p.is_superadmin,
              p.is_active,
              p.profile_complete,
              p.created_at,
              p.updated_at,
              c.email,
              c.last_login_at,
              p.global_role_id,
              gr.name AS global_role,
              COALESCE(
                json_agg(
                  json_build_object(
                    'id',        umr.id,
                    'module_id', umr.module_id,
                    'module',    m.name,
                    'role_id',   umr.role_id,
                    'role',      mr.name,
                    'assigned_at', umr.assigned_at
                  )
                ) FILTER (WHERE umr.id IS NOT NULL),
                '[]'
              ) AS roles
       FROM   users.profiles         p
       JOIN   auth.credentials       c   ON c.user_id   = p.id
       LEFT JOIN config.global_roles gr  ON gr.id       = p.global_role_id
       LEFT JOIN modules.user_module_roles umr ON umr.user_id  = p.id AND umr.is_active = true
       LEFT JOIN modules.modules          m   ON m.id         = umr.module_id
       LEFT JOIN modules.module_roles     mr  ON mr.id        = umr.role_id
       WHERE  p.id = $1 AND p.deleted_at IS NULL
       GROUP  BY p.id, c.email, c.last_login_at, gr.id, gr.name`,
      [id],
    );

    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);
    return user;
  }

  async updateUser(actorId: string, id: string, dto: UpdateUserDto) {
    const [user] = await this.db.query<{ id: string; is_superadmin: boolean }[]>(
      `SELECT id, is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);

    if (dto.is_superadmin !== undefined) {
      const [actor] = await this.db.query<{ is_superadmin: boolean }[]>(
        `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
        [actorId],
      );
      if (!actor?.is_superadmin) throw new ForbiddenException('Solo superadmin puede modificar is_superadmin');
    }

    const fields: string[] = [];
    const params: unknown[] = [];

    const add = (col: string, val: unknown) => {
      params.push(val);
      fields.push(`${col} = $${params.length}`);
    };

    if (dto.first_name     !== undefined) add('first_name',     dto.first_name);
    if (dto.last_name      !== undefined) add('last_name',      dto.last_name);
    if (dto.phone          !== undefined) add('phone',          dto.phone);
    if (dto.avatar_url     !== undefined) add('avatar_url',     dto.avatar_url);
    if (dto.is_active      !== undefined) add('is_active',      dto.is_active);
    if (dto.is_superadmin  !== undefined) add('is_superadmin',  dto.is_superadmin);
    if (dto.global_role_id !== undefined) add('global_role_id', dto.global_role_id);
    if (dto.address        !== undefined) add('address',        dto.address);
    if (dto.job_title      !== undefined) add('job_title',      dto.job_title);
    if (dto.department     !== undefined) add('department',     dto.department);
    if (dto.primary_sede   !== undefined) add('primary_sede',   dto.primary_sede);
    if (dto.username       !== undefined) add('username',       dto.username ? dto.username.toLowerCase().trim() : null);

    if (fields.length === 0) throw new BadRequestException('Sin campos para actualizar');

    params.push(id);
    await this.db.query(
      `UPDATE users.profiles SET ${fields.join(', ')} WHERE id = $${params.length}`,
      params,
    );

    if (dto.is_active !== undefined) {
      await this.db.query(
        `UPDATE auth.credentials SET is_active = $1 WHERE user_id = $2`,
        [dto.is_active, id],
      );
    }

    return this.getUser(id);
  }

  async deleteUser(actorId: string, id: string) {
    if (actorId === id) throw new BadRequestException('No puedes eliminarte a ti mismo');

    const [user] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!user) throw new NotFoundException(`Usuario ${id} no encontrado`);

    await this.db.query(
      `UPDATE users.profiles
       SET deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days', is_active = false
       WHERE id = $1`,
      [id],
    );
    await this.db.query(
      `UPDATE auth.credentials SET is_active = false WHERE user_id = $1`,
      [id],
    );
    await this.db.query(
      `DELETE FROM auth.refresh_tokens WHERE user_id = $1`,
      [id],
    );

    this.logger.log(`Usuario ${id} eliminado (soft) por actor ${actorId}`);
    return { ok: true, message: 'Usuario eliminado' };
  }

  async bulkImportUsers(
    actorId: string,
    rows: { first_name: string; last_name: string; email: string; username?: string; is_superadmin?: boolean }[],
  ) {
    const results: { row: number; email: string; status: 'created' | 'failed'; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        await this.createUser(actorId, {
          first_name:   row.first_name.trim(),
          last_name:    row.last_name.trim(),
          email:        row.email.trim().toLowerCase(),
          username:     row.username?.trim() || undefined,
          is_superadmin: !!row.is_superadmin,
        } as any);
        results.push({ row: i + 1, email: row.email, status: 'created' });
      } catch (err: any) {
        results.push({ row: i + 1, email: row.email, status: 'failed', error: err?.message ?? 'Error desconocido' });
      }
    }

    const created = results.filter((r) => r.status === 'created').length;
    const failed  = results.filter((r) => r.status === 'failed');
    this.logger.log(`Bulk import: ${created} creados, ${failed.length} fallidos — actor ${actorId}`);
    return { created, failed, total: rows.length };
  }

  async bulkImportForModule(
    actorId: string,
    rows: { first_name: string; last_name: string; email: string; username?: string }[],
  ): Promise<{
    user_ids: string[];
    created:  number;
    existing: number;
    failed:   { row: number; email: string; error: string }[];
  }> {
    const userIds: string[] = [];
    const failed: { row: number; email: string; error: string }[] = [];
    let created  = 0;
    let existing = 0;

    for (let i = 0; i < rows.length; i++) {
      const row   = rows[i];
      const email = row.email.trim().toLowerCase();

      const [cred] = await this.db.query<{ user_id: string }[]>(
        `SELECT user_id FROM auth.credentials WHERE email = $1`,
        [email],
      );

      if (cred) {
        userIds.push(cred.user_id);
        existing++;
        continue;
      }

      try {
        const newUser = await this.createUser(actorId, {
          first_name: row.first_name.trim(),
          last_name:  row.last_name.trim(),
          email,
          username:   row.username?.trim() || undefined,
        } as any);
        userIds.push(newUser.id);
        created++;
      } catch (err: any) {
        failed.push({ row: i + 1, email, error: err?.message ?? 'Error desconocido' });
      }
    }

    this.logger.log(`BulkImportForModule: ${created} creados, ${existing} existentes, ${failed.length} fallidos`);
    return { user_ids: userIds, created, existing, failed };
  }
}
