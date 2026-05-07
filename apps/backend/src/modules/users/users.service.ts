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
import { ChangePasswordDto } from './dto/change-password.dto';
import { PreferencesDto } from './dto/preferences.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AvailabilityDto } from './dto/availability.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ─── CRUD usuarios ───────────────────────────────────────────────────────────

  async createUser(actorId: string, dto: CreateUserDto) {
    const email = dto.email.toLowerCase().trim();

    // email único en auth.credentials
    const [existing] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM auth.credentials WHERE email = $1`,
      [email],
    );
    if (existing) throw new ConflictException(`Email ${email} ya está registrado`);

    // solo superadmin puede crear otro superadmin
    if (dto.is_superadmin) {
      const [actor] = await this.db.query<{ is_superadmin: boolean }[]>(
        `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
        [actorId],
      );
      if (!actor?.is_superadmin) throw new ForbiddenException('Solo superadmin puede crear otro superadmin');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    // Check username uniqueness if provided
    if (dto.username) {
      const normalized = dto.username.toLowerCase().trim();
      const [uConflict] = await this.db.query<{ id: string }[]>(
        `SELECT id FROM users.profiles WHERE LOWER(username) = $1 AND deleted_at IS NULL`,
        [normalized],
      );
      if (uConflict) throw new ConflictException(`Nombre de usuario '${normalized}' ya está en uso`);
    }

    // Profile is complete if all mandatory fields are provided at creation time
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
        dto.phone    ?? null,
        dto.username ? dto.username.toLowerCase().trim() : null,
        dto.address  ?? null,
        dto.job_title   ?? null,
        dto.department  ?? null,
        dto.primary_sede ?? null,
        dto.is_superadmin ?? false,
        dto.global_role_id ?? null,
        hasAllProfileFields,
      ],
    );

    await this.db.query(
      `INSERT INTO auth.credentials (user_id, email, password_hash)
       VALUES ($1, $2, $3)`,
      [profile.id, email, passwordHash],
    );

    // preferencias por defecto
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
    const page  = Math.max(1, query.page  ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
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
       GROUP  BY p.id, c.email, c.last_login_at, gr.id, gr.name
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

    // solo superadmin puede cambiar is_superadmin
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

    if (dto.first_name    !== undefined) add('first_name',    dto.first_name);
    if (dto.last_name     !== undefined) add('last_name',     dto.last_name);
    if (dto.phone         !== undefined) add('phone',         dto.phone);
    if (dto.avatar_url    !== undefined) add('avatar_url',    dto.avatar_url);
    if (dto.is_active     !== undefined) add('is_active',     dto.is_active);
    if (dto.is_superadmin !== undefined) add('is_superadmin', dto.is_superadmin);
    if (dto.global_role_id !== undefined) add('global_role_id', dto.global_role_id);
    if (dto.address       !== undefined) add('address',       dto.address);
    if (dto.job_title     !== undefined) add('job_title',     dto.job_title);
    if (dto.department    !== undefined) add('department',    dto.department);
    if (dto.primary_sede  !== undefined) add('primary_sede',  dto.primary_sede);
    if (dto.username      !== undefined) add('username',      dto.username ? dto.username.toLowerCase().trim() : null);

    if (fields.length === 0) throw new BadRequestException('Sin campos para actualizar');

    params.push(id);
    await this.db.query(
      `UPDATE users.profiles SET ${fields.join(', ')} WHERE id = $${params.length}`,
      params,
    );

    // sincronizar is_active en credentials
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
      `UPDATE auth.credentials  SET is_active = false WHERE user_id = $1`,
      [id],
    );
    // revocar todos los refresh tokens activos
    await this.db.query(
      `DELETE FROM auth.refresh_tokens WHERE user_id = $1`,
      [id],
    );

    this.logger.log(`Usuario ${id} eliminado (soft) por actor ${actorId}`);
    return { ok: true, message: 'Usuario eliminado' };
  }

  // ─── Perfil propio ───────────────────────────────────────────────────────────

  async getMyProfile(userId: string) {
    const [profile] = await this.db.query<any[]>(
      `SELECT p.id,
              p.first_name,
              p.last_name,
              p.display_email,
              p.phone,
              p.avatar_url,
              p.is_superadmin,
              p.is_active,
              p.created_at,
              p.updated_at,
              p.username,
              p.address,
              p.job_title,
              p.department,
              p.primary_sede,
              p.profile_complete,
              c.email,
              c.last_login_at,
              pref.language,
              pref.timezone,
              pref.notification_email,
              pref.notification_whatsapp,
              pref.notification_in_app,
              COALESCE(
                json_agg(
                  json_build_object(
                    'module_id', umr.module_id,
                    'module',    m.name,
                    'role',      mr.name
                  )
                ) FILTER (WHERE umr.id IS NOT NULL),
                '[]'
              ) AS roles
       FROM   users.profiles              p
       JOIN   auth.credentials            c    ON c.user_id   = p.id
       LEFT JOIN users.preferences        pref ON pref.user_id = p.id
       LEFT JOIN modules.user_module_roles umr ON umr.user_id  = p.id AND umr.is_active = true
       LEFT JOIN modules.modules           m   ON m.id        = umr.module_id
       LEFT JOIN modules.module_roles      mr  ON mr.id       = umr.role_id
       WHERE  p.id = $1 AND p.deleted_at IS NULL
       GROUP  BY p.id, c.email, c.last_login_at, pref.id`,
      [userId],
    );

    if (!profile) throw new NotFoundException('Perfil no encontrado');
    return profile;
  }

  async completeMyProfile(userId: string, dto: CompleteProfileDto) {
    if (dto.username) {
      const normalized = dto.username.toLowerCase().trim();
      const [conflict] = await this.db.query<{ id: string }[]>(
        `SELECT id FROM users.profiles WHERE LOWER(username) = $1 AND id != $2 AND deleted_at IS NULL`,
        [normalized, userId],
      );
      if (conflict) throw new ConflictException(`Nombre de usuario '${normalized}' ya está en uso`);
    }

    await this.db.query(
      `UPDATE users.profiles
       SET phone            = $1,
           address          = $2,
           primary_sede     = $3,
           department       = $4,
           job_title        = $5,
           username         = COALESCE($6, username),
           profile_complete = true,
           updated_at       = now()
       WHERE id = $7 AND deleted_at IS NULL`,
      [
        dto.phone.trim(),
        dto.address.trim(),
        dto.primary_sede.trim(),
        dto.department.trim(),
        dto.job_title.trim(),
        dto.username ? dto.username.toLowerCase().trim() : null,
        userId,
      ],
    );

    return this.getMyProfile(userId);
  }

  async updateMyProfile(userId: string, dto: UpdateUserDto) {
    const fields: string[] = [];
    const params: unknown[] = [];

    const add = (col: string, val: unknown) => {
      params.push(val);
      fields.push(`${col} = $${params.length}`);
    };

    // username: validate uniqueness
    if (dto.username !== undefined) {
      const normalized = dto.username ? dto.username.toLowerCase().trim() : null;
      if (normalized) {
        const [conflict] = await this.db.query<{ id: string }[]>(
          `SELECT id FROM users.profiles WHERE LOWER(username) = $1 AND id != $2 AND deleted_at IS NULL`,
          [normalized, userId],
        );
        if (conflict) throw new ConflictException(`Nombre de usuario '${normalized}' ya está en uso`);
      }
      add('username', normalized);
    }

    if (dto.first_name   !== undefined) add('first_name',   dto.first_name);
    if (dto.last_name    !== undefined) add('last_name',     dto.last_name);
    if (dto.phone        !== undefined) add('phone',         dto.phone);
    if (dto.avatar_url   !== undefined) add('avatar_url',    dto.avatar_url);
    if (dto.address      !== undefined) add('address',       dto.address);
    if (dto.job_title    !== undefined) add('job_title',     dto.job_title);
    if (dto.department   !== undefined) add('department',    dto.department);
    if (dto.primary_sede !== undefined) add('primary_sede',  dto.primary_sede);

    if (fields.length === 0) throw new BadRequestException('Sin campos para actualizar');

    params.push(userId);
    await this.db.query(
      `UPDATE users.profiles SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${params.length} AND deleted_at IS NULL`,
      params,
    );

    return this.getMyProfile(userId);
  }

  async changePassword(userId: string, dto: ChangePasswordDto) {
    const [cred] = await this.db.query<{ password_hash: string }[]>(
      `SELECT password_hash FROM auth.credentials WHERE user_id = $1 AND is_active = true`,
      [userId],
    );
    if (!cred) throw new NotFoundException('Credenciales no encontradas');

    if (cred.password_hash.startsWith('!')) {
      throw new BadRequestException('Cuenta OAuth — no tiene contraseña local');
    }

    const valid = await bcrypt.compare(dto.current_password, cred.password_hash);
    if (!valid) throw new BadRequestException('Contraseña actual incorrecta');

    if (dto.current_password === dto.new_password) {
      throw new BadRequestException('La nueva contraseña debe ser diferente');
    }

    const newHash = await bcrypt.hash(dto.new_password, BCRYPT_ROUNDS);
    await this.db.query(
      `UPDATE auth.credentials SET password_hash = $1 WHERE user_id = $2`,
      [newHash, userId],
    );

    // revocar todos los refresh tokens para forzar re-login
    await this.db.query(
      `DELETE FROM auth.refresh_tokens WHERE user_id = $1`,
      [userId],
    );

    return { ok: true, message: 'Contraseña actualizada. Sesiones anteriores revocadas.' };
  }

  // ─── Preferencias ────────────────────────────────────────────────────────────

  async getMyPreferences(userId: string): Promise<any> {
    const [pref] = await this.db.query<any[]>(
      `SELECT language, timezone, notification_email, notification_whatsapp,
              notification_in_app, ui_settings, updated_at
       FROM   users.preferences
       WHERE  user_id = $1`,
      [userId],
    );

    // puede no existir si se creó antes del INSERT automático
    if (!pref) {
      await this.db.query(
        `INSERT INTO users.preferences (user_id) VALUES ($1) ON CONFLICT DO NOTHING`,
        [userId],
      );
      return this.getMyPreferences(userId);
    }

    return pref;
  }

  async upsertMyPreferences(userId: string, dto: PreferencesDto) {
    await this.db.query(
      `INSERT INTO users.preferences
         (user_id, language, timezone, notification_email, notification_whatsapp, notification_in_app, ui_settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id) DO UPDATE SET
         language              = EXCLUDED.language,
         timezone              = EXCLUDED.timezone,
         notification_email    = EXCLUDED.notification_email,
         notification_whatsapp = EXCLUDED.notification_whatsapp,
         notification_in_app   = EXCLUDED.notification_in_app,
         ui_settings           = EXCLUDED.ui_settings`,
      [
        userId,
        dto.language              ?? 'es',
        dto.timezone              ?? 'America/Bogota',
        dto.notification_email    ?? true,
        dto.notification_whatsapp ?? false,
        dto.notification_in_app   ?? true,
        dto.ui_settings           ? JSON.stringify(dto.ui_settings) : null,
      ],
    );

    return this.getMyPreferences(userId);
  }

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

    // rol existe y pertenece al módulo
    const [role] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM modules.module_roles
       WHERE  id = $1 AND module_id = $2 AND is_active = true`,
      [dto.role_id, dto.module_id],
    );
    if (!role) throw new NotFoundException(`Rol ${dto.role_id} no existe en módulo ${dto.module_id}`);

    // conflicto: ya existe activo
    const [existing] = await this.db.query<{ id: string; is_active: boolean }[]>(
      `SELECT id, is_active FROM modules.user_module_roles
       WHERE  user_id = $1 AND module_id = $2 AND role_id = $3`,
      [userId, dto.module_id, dto.role_id],
    );

    if (existing) {
      if (existing.is_active) {
        throw new ConflictException('Usuario ya tiene ese rol en ese módulo');
      }
      // reactivar
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

  async getUsersByModule(moduleId: string) {
    await this.assertModuleExists(moduleId);

    return this.db.query<any[]>(
      `SELECT p.id,
              p.first_name,
              p.last_name,
              p.avatar_url,
              c.email,
              p.is_active,
              ts.is_available,
              ts.reason        AS unavailability_reason,
              ts.unavailable_from,
              ts.unavailable_to,
              COALESCE(
                json_agg(
                  json_build_object(
                    'umr_id',   umr.id,
                    'role_id',  umr.role_id,
                    'role',     mr.name,
                    'assigned_at', umr.assigned_at
                  )
                ) FILTER (WHERE umr.id IS NOT NULL),
                '[]'
              ) AS roles
       FROM   modules.user_module_roles umr
       JOIN   users.profiles            p   ON p.id    = umr.user_id
       JOIN   auth.credentials          c   ON c.user_id = p.id
       JOIN   modules.module_roles      mr  ON mr.id   = umr.role_id
       LEFT JOIN modules.technician_status ts
              ON ts.user_id = umr.user_id AND ts.module_id = umr.module_id
       WHERE  umr.module_id  = $1
         AND  umr.is_active  = true
         AND  p.deleted_at   IS NULL
       GROUP  BY p.id, c.email, ts.is_available, ts.reason, ts.unavailable_from, ts.unavailable_to
       ORDER  BY p.first_name, p.last_name`,
      [moduleId],
    );
  }

  // ─── Roles globales ──────────────────────────────────────────────────────────

  async listGlobalRoles() {
    return this.db.query<any[]>(
      `SELECT id, name, description, is_active, created_at,
              (SELECT COUNT(*) FROM users.profiles WHERE global_role_id = gr.id AND deleted_at IS NULL)::int AS user_count
       FROM config.global_roles gr
       WHERE gr.deleted_at IS NULL
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
      `SELECT id FROM config.global_roles WHERE id = $1 AND deleted_at IS NULL`,
      [id],
    );
    if (!role) throw new NotFoundException(`Rol global ${id} no encontrado`);

    await this.db.query(
      `UPDATE config.global_roles
       SET is_active = false, deleted_at = now(), scheduled_hard_delete_at = now() + INTERVAL '90 days'
       WHERE id = $1`,
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
      `UPDATE config.global_roles SET is_active = true WHERE id = $1`,
      [id],
    );
    return { ok: true };
  }

  // ─── Asignación masiva de roles por módulo ────────────────────────────────────

  async bulkAssignModuleRole(actorId: string, userIds: string[], moduleId: string, roleId: string) {
    await this.assertModuleExists(moduleId);
    await this.assertActorCanManageModule(actorId, moduleId);

    // Verify the role belongs to the module
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

  // ─── Helpers privados ────────────────────────────────────────────────────────

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
          dto.reason         ?? null,
          dto.unavailable_from ?? null,
          dto.unavailable_to   ?? null,
          dto.notes          ?? null,
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

    // UNIQUE (module_id, user_id, category_slug) — manejar soft-deleted
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
      // reactivar soft-deleted
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
}
