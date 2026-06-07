import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PreferencesDto } from './dto/preferences.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ─── Perfil propio ───────────────────────────────────────────────────────────

  async getMyProfile(userId: string) {
    const [profile] = await this.db.query<any[]>(
      `SELECT p.id,
              p.first_name,
              p.last_name,
              p.phone_prefix,
              p.phone,
              p.avatar_url,
              p.is_superadmin,
              p.is_active,
              p.created_at,
              p.updated_at,
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
              p.profile_complete,
              p.display_email,
              c.email,
              c.last_login_at,
              pref.language,
              pref.timezone,
              pref.notification_email,
              pref.notification_whatsapp,
              pref.notification_in_app,
              COALESCE(mfa.totp_enabled, false)  AS totp_enabled,
              COALESCE(c.otp_enabled,   true)    AS otp_enabled,
              COALESCE(
                json_agg(
                  json_build_object(
                    'umr_id',      umr.id,
                    'module_id',   umr.module_id,
                    'module_name', m.name,
                    'role_name',   mr.name,
                    'status',      CASE WHEN umr.is_active THEN 'active' ELSE 'inactive' END,
                    'assigned_at', umr.assigned_at
                  )
                ) FILTER (WHERE umr.id IS NOT NULL),
                '[]'
              ) AS module_roles
       FROM   users.profiles              p
       JOIN   auth.credentials            c    ON c.user_id   = p.id
       LEFT JOIN users.preferences        pref ON pref.user_id = p.id
       LEFT JOIN auth.mfa_settings        mfa  ON mfa.user_id  = p.id
       LEFT JOIN modules.user_module_roles umr ON umr.user_id  = p.id AND umr.is_active = true
       LEFT JOIN modules.modules           m   ON m.id        = umr.module_id
       LEFT JOIN modules.module_roles      mr  ON mr.id       = umr.role_id
       WHERE  p.id = $1 AND p.deleted_at IS NULL
       GROUP  BY p.id, c.email, c.last_login_at, pref.id, mfa.totp_enabled, c.otp_enabled`,
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
       SET phone             = $1,
           address           = $2,
           primary_sede      = $3,
           department        = $4,
           job_title         = $5,
           username          = COALESCE($6, username),
           phone_prefix      = COALESCE($8, phone_prefix),
           country           = COALESCE($9, country),
           state_province    = COALESCE($10, state_province),
           city              = COALESCE($11, city),
           org_node_id       = COALESCE($12, org_node_id),
           position_node_id  = COALESCE($13, position_node_id),
           profile_complete  = true,
           updated_at        = now()
       WHERE id = $7 AND deleted_at IS NULL`,
      [
        dto.phone.trim(),
        dto.address.trim(),
        dto.primary_sede.trim(),
        dto.department.trim(),
        dto.job_title.trim(),
        dto.username ? dto.username.toLowerCase().trim() : null,
        userId,
        dto.phone_prefix     ?? null,
        dto.country          ?? null,
        dto.state_province   ?? null,
        dto.city             ?? null,
        dto.org_node_id      ?? null,
        dto.position_node_id ?? null,
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

    if (dto.first_name              !== undefined) add('first_name',              dto.first_name);
    if (dto.last_name               !== undefined) add('last_name',               dto.last_name);
    if (dto.phone_prefix            !== undefined) add('phone_prefix',            dto.phone_prefix);
    if (dto.phone                   !== undefined) add('phone',                   dto.phone);
    if (dto.avatar_url              !== undefined) add('avatar_url',              dto.avatar_url);
    if (dto.address                 !== undefined) add('address',                 dto.address);
    if (dto.country                 !== undefined) add('country',                 dto.country);
    if (dto.state_province          !== undefined) add('state_province',          dto.state_province);
    if (dto.city                    !== undefined) add('city',                    dto.city);
    if (dto.birth_date              !== undefined) add('birth_date',              dto.birth_date);
    if (dto.national_id             !== undefined) add('national_id',             dto.national_id);
    if (dto.gender                  !== undefined) add('gender',                  dto.gender);
    if (dto.emergency_contact_name  !== undefined) add('emergency_contact_name',  dto.emergency_contact_name);
    if (dto.emergency_contact_phone !== undefined) add('emergency_contact_phone', dto.emergency_contact_phone);
    if (dto.job_title               !== undefined) add('job_title',               dto.job_title);
    if (dto.department              !== undefined) add('department',               dto.department);
    if (dto.primary_sede            !== undefined) add('primary_sede',             dto.primary_sede);

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
    try {
      await this.db.query(
        `UPDATE auth.credentials SET password_hash = $1, force_password_change = false WHERE user_id = $2`,
        [newHash, userId],
      );
    } catch {
      await this.db.query(
        `UPDATE auth.credentials SET password_hash = $1 WHERE user_id = $2`,
        [newHash, userId],
      );
    }

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

  // ─── Sesiones ────────────────────────────────────────────────────────────────

  async getMySessions(userId: string) {
    const [profile] = await this.db.query<{ last_seen_at: string | null }[]>(
      `SELECT last_seen_at FROM users.profiles WHERE id = $1`,
      [userId],
    );
    const ts = profile?.last_seen_at ? new Date(profile.last_seen_at).getTime() : 0;
    const is_online = ts > 0 && Date.now() - ts < 5 * 60 * 1000;

    const sessions = await this.db.query<any[]>(
      `SELECT id,
              CASE WHEN ended_at IS NULL AND expires_at > now()
                   THEN ip_address::text
                   ELSE NULL
              END                                         AS ip_address,
              user_agent,
              expires_at,
              ended_at,
              created_at,
              geo_city,
              geo_country,
              geo_country_code,
              geo_lat::float                              AS geo_lat,
              geo_lon::float                              AS geo_lon,
              (ended_at IS NULL AND expires_at > now())   AS is_active
       FROM   auth.sessions
       WHERE  user_id = $1
       ORDER  BY created_at DESC
       LIMIT  20`,
      [userId],
    );

    return { sessions, is_online, last_seen_at: profile?.last_seen_at ?? null };
  }

  // ─── Actividad ───────────────────────────────────────────────────────────────

  async getActivityGraph(userId: string): Promise<{ day: string; count: number }[]> {
    const rows = await this.db.query<{ day: string; count: string }[]>(
      `SELECT DATE(created_at AT TIME ZONE 'America/Bogota') AS day,
              COUNT(*)::int                                  AS count
       FROM   audit.event_log
       WHERE  actor_id   = $1
         AND  created_at >= now() - INTERVAL '26 weeks'
       GROUP  BY day
       ORDER  BY day`,
      [userId],
    );
    return rows.map((r) => ({ day: r.day, count: parseInt(r.count as unknown as string, 10) }));
  }

  async getMyRecentTickets(userId: string, limit = 6) {
    return this.db.query<any[]>(
      `SELECT t.id, t.title, t.priority, t.created_at, t.updated_at,
              m.name  AS module_name,
              m.slug  AS module_slug,
              s.label            AS state_label,
              s.name             AS state_name,
              s.is_final,
              s.is_pause_state,
              s.is_approval_state,
              st.status          AS sla_status,
              st.deadline_at     AS sla_deadline_tracked,
              st.approval_expires_at
       FROM   tickets.tickets t
       JOIN   modules.modules  m  ON m.id = t.module_id
       JOIN   tickets.states   s  ON s.id = t.current_state_id
       LEFT JOIN tickets.ticket_sla_tracking st ON st.ticket_id = t.id
       WHERE  t.created_by = $1
       ORDER  BY t.created_at DESC
       LIMIT  $2`,
      [userId, limit],
    );
  }

  async getMyAssignedTickets(userId: string, limit = 50, moduleId?: string) {
    const params: any[] = [userId];
    let moduleWhere = '';
    if (moduleId) {
      params.push(moduleId);
      moduleWhere = `AND t.module_id = $${params.length}`;
    }
    params.push(limit);
    const limitParam = `$${params.length}`;

    return this.db.query<any[]>(
      `SELECT *
       FROM (
         SELECT DISTINCT ON (t.id)
                t.id, t.title, t.priority, t.created_at, t.updated_at,
                m.id    AS module_id,
                m.name  AS module_name,
                m.slug  AS module_slug,
                c.name  AS category_name,
                e.name  AS environment_name,
                t.current_state_id,
                s.label            AS state_label,
                s.name             AS state_name,
                s.is_final,
                s.is_pause_state,
                s.is_approval_state,
                t.created_by,
                up.first_name || ' ' || up.last_name AS creator_name,
                st.status      AS sla_status,
                st.deadline_at AS sla_deadline_tracked,
                ta.role        AS assignment_role,
                (SELECT tsh.transition_reason
                 FROM   tickets.ticket_state_history tsh
                 WHERE  tsh.ticket_id = t.id
                   AND  tsh.transition_reason IS NOT NULL
                 ORDER  BY tsh.transitioned_at DESC
                 LIMIT  1) AS last_transition_reason
         FROM   tickets.tickets t
         JOIN   modules.modules m  ON m.id  = t.module_id
         LEFT JOIN modules.categories c ON c.id = t.category_id
         LEFT JOIN modules.environments e ON e.id = t.environment_id
         JOIN   tickets.states  s  ON s.id  = t.current_state_id
         JOIN   tickets.ticket_assignments ta
                ON ta.ticket_id = t.id AND ta.user_id = $1 AND ta.is_active = true
         JOIN   users.profiles up ON up.id = t.created_by
         LEFT JOIN tickets.ticket_sla_tracking st ON st.ticket_id = t.id
         WHERE  s.is_final = false
           ${moduleWhere}
         ORDER  BY t.id
       ) sub
       ORDER BY
         CASE priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT ${limitParam}`,
      params,
    );
  }

  async getUserAssignedTickets(targetUserId: string, moduleId?: string, limit = 100) {
    const params: any[] = [targetUserId];
    let moduleWhere = '';
    if (moduleId) {
      params.push(moduleId);
      moduleWhere = `AND t.module_id = $${params.length}`;
    }
    params.push(limit);
    const limitParam = `$${params.length}`;

    return this.db.query<any[]>(
      `SELECT *
       FROM (
         SELECT DISTINCT ON (t.id)
                t.id, t.title, t.priority, t.created_at, t.updated_at,
                m.id    AS module_id,
                m.name  AS module_name,
                m.slug  AS module_slug,
                c.name  AS category_name,
                e.name  AS environment_name,
                t.current_state_id,
                s.label            AS state_label,
                s.name             AS state_name,
                s.is_final,
                s.is_pause_state,
                s.is_approval_state,
                t.created_by,
                up.first_name || ' ' || up.last_name AS creator_name,
                st.status      AS sla_status,
                st.deadline_at AS sla_deadline_tracked,
                ta.role        AS assignment_role,
                (SELECT tsh.transition_reason
                 FROM   tickets.ticket_state_history tsh
                 WHERE  tsh.ticket_id = t.id
                   AND  tsh.transition_reason IS NOT NULL
                 ORDER  BY tsh.transitioned_at DESC
                 LIMIT  1) AS last_transition_reason
         FROM   tickets.tickets t
         JOIN   modules.modules m  ON m.id  = t.module_id
         LEFT JOIN modules.categories c ON c.id = t.category_id
         LEFT JOIN modules.environments e ON e.id = t.environment_id
         JOIN   tickets.states  s  ON s.id  = t.current_state_id
         JOIN   tickets.ticket_assignments ta
                ON ta.ticket_id = t.id AND ta.user_id = $1 AND ta.is_active = true
         JOIN   users.profiles up ON up.id = t.created_by
         LEFT JOIN tickets.ticket_sla_tracking st ON st.ticket_id = t.id
         WHERE  s.is_final = false
           ${moduleWhere}
         ORDER  BY t.id
       ) sub
       ORDER BY
         CASE priority WHEN 'critica' THEN 0 WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END,
         updated_at DESC
       LIMIT ${limitParam}`,
      params,
    );
  }

  async getMyTechStats(userId: string, moduleId?: string) {
    const params: any[] = [userId];
    let moduleJoin  = '';
    let moduleWhere = '';
    if (moduleId) {
      params.push(moduleId);
      moduleJoin  = `JOIN tickets.tickets t ON t.id = r.ticket_id`;
      moduleWhere = `AND t.module_id = $${params.length}`;
    }

    const [stats] = await this.db.query<any[]>(
      `SELECT
         COUNT(r.id)::int AS rated_tickets,
         COALESCE(ROUND(AVG(COALESCE(r.score_overall,
           (COALESCE(r.score_attention,0) + COALESCE(r.score_clarity,0)
            + COALESCE(r.score_response_time,0) + COALESCE(r.score_quality,0)) / 4.0
         ))::numeric, 2), 0)::float AS avg_rating
       FROM tickets.ticket_ratings r
       ${moduleJoin}
       WHERE r.technician_id = $1 AND r.is_expired = false
         ${moduleWhere}`,
      params,
    );
    return {
      rated_tickets: stats?.rated_tickets ?? 0,
      avg_rating:    parseFloat(stats?.avg_rating ?? '0'),
    };
  }

  async getActivityFeed(userId: string) {
    return this.db.query<{
      type: string; title: string; context: string; meta: string; ts: string;
    }[]>(`
      WITH tickets_cte AS (
        SELECT 'ticket_created'::text AS type,
               t.title::text          AS title,
               m.name::text           AS context,
               t.priority::text       AS meta,
               t.created_at           AS ts
        FROM   tickets.tickets t
        JOIN   modules.modules m ON m.id = t.module_id
        WHERE  t.created_by = $1
          AND  t.created_at > now() - INTERVAL '90 days'
        ORDER  BY t.created_at DESC LIMIT 6
      ),
      requests_cte AS (
        SELECT ('request_' || r.status)::text          AS type,
               r.title::text                           AS title,
               r.type::text                            AS context,
               r.priority::text                        AS meta,
               GREATEST(r.updated_at, r.created_at)   AS ts
        FROM   requests.admin_requests r
        WHERE  r.requester_id = $1
          AND  r.deleted_at IS NULL
          AND  r.updated_at > now() - INTERVAL '90 days'
        ORDER  BY r.updated_at DESC LIMIT 6
      ),
      sessions_cte AS (
        SELECT 'login'::text AS type,
               'Inicio de sesión'::text AS title,
               COALESCE(geo_city || ', ' || geo_country, 'Desconocido')::text AS context,
               ''::text AS meta,
               created_at AS ts
        FROM   auth.sessions
        WHERE  user_id = $1
          AND  created_at > now() - INTERVAL '90 days'
        ORDER  BY created_at DESC LIMIT 3
      )
      SELECT * FROM (
        SELECT * FROM tickets_cte
        UNION ALL SELECT * FROM requests_cte
        UNION ALL SELECT * FROM sessions_cte
      ) combined
      ORDER BY ts DESC
      LIMIT 20
    `, [userId]);
  }

  async getUserRequestStats(userId: string) {
    const [tc] = await this.db.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total FROM tickets.tickets WHERE created_by = $1`,
      [userId],
    );
    const reqRows = await this.db.query<{ status: string; cnt: string }[]>(
      `SELECT status, COUNT(*)::text AS cnt
       FROM   requests.admin_requests
       WHERE  requester_id = $1 AND deleted_at IS NULL
       GROUP  BY status`,
      [userId],
    );
    const byStatus: Record<string, number> = {};
    let reqTotal = 0;
    for (const r of reqRows) {
      byStatus[r.status] = parseInt(r.cnt, 10);
      reqTotal += parseInt(r.cnt, 10);
    }
    return {
      tickets_total:       parseInt(tc?.total ?? '0', 10),
      requests_total:      reqTotal,
      requests_by_status:  byStatus,
    };
  }
}
