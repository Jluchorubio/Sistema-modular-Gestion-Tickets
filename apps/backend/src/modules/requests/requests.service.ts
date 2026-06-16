import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingService } from '../../shared/messaging/messaging.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ReviewRequestDto } from './dto/review-request.dto';
import { calculatePriority } from './priority.engine';
import { resolveAssignee } from './routing.engine';
import { SystemConfigService } from '../system-config/system-config.service';
import { SlaEvaluatorService } from '../tickets/sla/sla-evaluator.service';

const PRIORITY_HOURS: Record<string, number> = { critica: 2, alta: 8, media: 24, baja: 72 };

@Injectable()
export class RequestsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly messaging: MessagingService,
    private readonly systemConfig: SystemConfigService,
    private readonly slaEvaluator: SlaEvaluatorService,
  ) {}

  async create(requesterId: string, dto: CreateRequestDto & { task_source?: 'user' | 'system' }) {
    const isActive = await this.systemConfig.isRequestTypeActive(dto.type);
    if (!isActive) throw new BadRequestException(`Tipo de solicitud "${dto.type}" no existe o no está activo`);

    const now        = new Date();
    const taskSource = dto.task_source === 'system' ? 'system' : 'user';
    const meta       = dto.metadata ?? null;
    const metaJson   = meta ? JSON.stringify(meta) : null;
    const moduleId   = (meta as any)?.module_id as string | undefined;

    // Auto-calculate priority from rules (same formula as tickets)
    const damageTypeId = (meta as any)?.damage_type_id as string | undefined ?? null;
    const { priority, auto } = await calculatePriority(
      this.db, dto.type, requesterId, dto.priority, damageTypeId,
    );

    // Auto-route to module admin or superadmin queue
    const { assignedTo, autoEscalated } = await resolveAssignee(this.db, meta);

    // SLA: resolve hours from config.sla_rules, then compute business-hours-aware deadline
    const hours = await this.resolveRequestSlaHours(dto.type, priority);
    const slaDeadline = await this.slaEvaluator.resolveDeadline(hours, now, moduleId ?? '');

    const [row] = await this.db.query<any[]>(
      `INSERT INTO requests.admin_requests
         (requester_id, type, title, description, priority, auto_priority, metadata,
          task_source, assigned_to, escalated, sla_due_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        requesterId, dto.type, dto.title.trim(), dto.description.trim(),
        priority, auto, metaJson, taskSource,
        assignedTo, autoEscalated, slaDeadline,
      ],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, new_status, notes)
       VALUES ($1, $2, 'created', 'pending', $3)`,
      [row.id, requesterId, autoEscalated ? 'Auto-escalada: sin admin en módulo' : null],
    );

    // Recurrence check: same requester+type 3+ times in last 30 days → auto-escalate
    const [{ count: recentCount }] = await this.db.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count
       FROM requests.admin_requests
       WHERE requester_id = $1
         AND type         = $2
         AND created_at   > now() - INTERVAL '30 days'
         AND deleted_at   IS NULL`,
      [requesterId, dto.type],
    );
    if (Number(recentCount) >= 3) {
      await this.db.query(
        `UPDATE requests.admin_requests
         SET escalated    = TRUE,
             escalated_at = now(),
             escalation_note = 'Auto-escalada por reincidencia: 3+ solicitudes del mismo tipo en 30 días',
             updated_at   = now()
         WHERE id = $1`,
        [row.id],
      );
      this.messaging.emit('request.escalated', { requestId: row.id });
    }

    this.messaging.emit('request.created', {
      requestId:   row.id,
      title:       row.title,
      requesterId,
      moduleId,
      type:        dto.type,
    });
    return row;
  }

  async completeMineTask(userId: string, requestId: string) {
    const [req] = await this.db.query<{ id: string; requester_id: string; type: string; status: string }[]>(
      `SELECT id, requester_id, type, status FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Tarea ${requestId} no encontrada`);
    if (req.requester_id !== userId) throw new ForbiddenException('No es tu tarea');
    if (req.type !== 'task') throw new ForbiddenException('Solo aplicable a tareas');

    await this.db.query(
      `UPDATE requests.admin_requests SET status = 'approved', updated_at = now() WHERE id = $1`,
      [requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, old_status, new_status)
       VALUES ($1, $2, 'completed', $3, 'approved')`,
      [requestId, userId, req.status],
    );
    return { ok: true };
  }

  async escalate(userId: string, requestId: string, note?: string) {
    const [req] = await this.db.query<{ id: string; status: string }[]>(
      `SELECT id, status FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);
    if (!['pending', 'taken', 'in_progress', 'under_review'].includes(req.status)) {
      throw new BadRequestException(`No se puede escalar una solicitud en estado "${req.status}"`);
    }

    await this.db.query(
      `UPDATE requests.admin_requests
       SET escalated       = TRUE,
           escalated_by    = $1,
           escalated_at    = now(),
           escalation_note = $2,
           updated_at      = now()
       WHERE id = $3`,
      [userId, note ?? null, requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, old_status, new_status, notes)
       VALUES ($1, $2, 'escalated', $3, $3, $4)`,
      [requestId, userId, req.status, note ?? null],
    );
    return { ok: true };
  }

  async deescalate(userId: string, requestId: string) {
    const [req] = await this.db.query<{ id: string; escalated: boolean }[]>(
      `SELECT id, escalated FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);
    if (!req.escalated) throw new BadRequestException('La solicitud no está escalada');

    await this.db.query(
      `UPDATE requests.admin_requests
       SET escalated       = FALSE,
           escalated_by    = NULL,
           escalated_at    = NULL,
           escalation_note = NULL,
           updated_at      = now()
       WHERE id = $1`,
      [requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, notes)
       VALUES ($1, $2, 'deescalated', 'Escalación resuelta')`,
      [requestId, userId],
    );
    return { ok: true };
  }

  async findAll(userId: string, opts: { status?: string; type?: string; source?: string; escalated?: boolean; moduleId?: string; page?: number; limit?: number }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;

    // Determine scope: superadmin sees all; module staff see requests for their module(s)
    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const isSuperadmin = profile?.is_superadmin ?? false;

    const conditions: string[] = ['r.deleted_at IS NULL'];
    const params: unknown[]    = [];

    if (!isSuperadmin) {
      params.push(userId);
      // Own requests always visible; active module roles expose module-scoped requests
      conditions.push(`(
        r.requester_id = $${params.length}
        OR r.assigned_to = $${params.length}
        OR r.metadata->>'module_id' IN (
          SELECT umr.module_id::text
          FROM   modules.user_module_roles umr
          WHERE  umr.user_id   = $${params.length}
            AND  umr.is_active = true
        )
      )`);
    }

    if (opts.status)              { params.push(opts.status);     conditions.push(`r.status                  = $${params.length}`); }
    if (opts.type)                { params.push(opts.type);       conditions.push(`r.type                    = $${params.length}`); }
    if (opts.source)              { params.push(opts.source);     conditions.push(`r.task_source             = $${params.length}`); }
    if (opts.moduleId)            { params.push(opts.moduleId);   conditions.push(`r.metadata->>'module_id'  = $${params.length}`); }
    if (opts.escalated === true)  { conditions.push(`r.escalated = TRUE`); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    params.push(limit, offset);
    const li = params.length - 1;
    const oi = params.length;

    const rows = await this.db.query<any[]>(
      `SELECT r.id, r.type, r.title, r.description, r.status, r.priority,
              r.metadata, r.created_at, r.updated_at, r.reviewed_at, r.review_notes,
              r.taken_at, r.taken_by, r.sla_due_at, r.task_source,
              r.escalated, r.escalated_at, r.escalation_note,
              p.first_name || ' ' || p.last_name   AS requester_name,
              p.id                                  AS requester_id,
              c.email                               AS requester_email,
              rv.first_name || ' ' || rv.last_name  AS reviewer_name,
              tb.first_name || ' ' || tb.last_name  AS taken_by_name,
              eb.first_name || ' ' || eb.last_name  AS escalated_by_name
       FROM   requests.admin_requests r
       JOIN   users.profiles          p  ON p.id = r.requester_id
       JOIN   auth.credentials        c  ON c.user_id = p.id
       LEFT JOIN users.profiles       rv ON rv.id = r.reviewed_by
       LEFT JOIN users.profiles       tb ON tb.id = r.taken_by
       LEFT JOIN users.profiles       eb ON eb.id = r.escalated_by
       ${where}
       ORDER  BY r.escalated DESC, r.created_at DESC
       LIMIT  $${li} OFFSET $${oi}`,
      params,
    );

    const [{ total }] = await this.db.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM requests.admin_requests r ${where}`,
      params.slice(0, params.length - 2),
    );

    return {
      data: rows,
      meta: { total: parseInt(total, 10), page, limit, pages: Math.ceil(parseInt(total, 10) / limit) },
    };
  }

  async findMine(userId: string, opts: { status?: string; page?: number; limit?: number }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(50, Math.max(1, opts.limit ?? 10));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['r.requester_id = $1', 'r.deleted_at IS NULL'];
    const params: unknown[]    = [userId];

    if (opts.status) { params.push(opts.status); conditions.push(`r.status = $${params.length}`); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    params.push(limit, offset);
    const li = params.length - 1;
    const oi = params.length;

    const rows = await this.db.query<any[]>(
      `SELECT r.id, r.type, r.title, r.description, r.status, r.priority,
              r.metadata, r.created_at, r.updated_at, r.reviewed_at, r.review_notes,
              r.taken_at, r.taken_by, r.sla_due_at, r.task_source,
              r.escalated, r.escalated_at, r.escalation_note, r.escalated_by,
              rv.first_name || ' ' || rv.last_name AS reviewer_name,
              tb.first_name || ' ' || tb.last_name AS taken_by_name,
              eb.first_name || ' ' || eb.last_name AS escalated_by_name
       FROM   requests.admin_requests r
       LEFT JOIN users.profiles rv ON rv.id = r.reviewed_by
       LEFT JOIN users.profiles tb ON tb.id = r.taken_by
       LEFT JOIN users.profiles eb ON eb.id = r.escalated_by
       ${where}
       ORDER  BY r.created_at DESC
       LIMIT  $${li} OFFSET $${oi}`,
      params,
    );

    const [{ total }] = await this.db.query<{ total: string }[]>(
      `SELECT COUNT(*) AS total FROM requests.admin_requests r ${where}`,
      params.slice(0, params.length - 2),
    );

    return {
      data: rows,
      meta: { total: parseInt(total, 10), page, limit, pages: Math.ceil(parseInt(total, 10) / limit) },
    };
  }

  async review(reviewerId: string, requestId: string, dto: ReviewRequestDto) {
    const [req] = await this.db.query<{
      id: string; status: string; requester_id: string;
    }[]>(
      `SELECT id, status, requester_id
       FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);

    if (req.requester_id === reviewerId)
      throw new ForbiddenException('No puedes revisar tu propia solicitud');

    const VALID_TRANSITIONS: Record<string, string[]> = {
      pending:      ['approved', 'rejected', 'under_review'],
      under_review: ['approved', 'rejected'],
      taken:        ['approved', 'rejected', 'under_review'],
      in_progress:  ['approved', 'rejected'],
    };
    if (!VALID_TRANSITIONS[req.status]?.includes(dto.status))
      throw new BadRequestException(`Transición inválida: "${req.status}" → "${dto.status}"`);

    const [updated] = await this.db.query<any[]>(
      `UPDATE requests.admin_requests
       SET status       = $1,
           reviewed_by  = $2,
           reviewed_at  = now(),
           review_notes = $3,
           updated_at   = now()
       WHERE id = $4
       RETURNING *`,
      [dto.status, reviewerId, dto.review_notes ?? null, requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline
         (request_id, actor_id, action, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestId, reviewerId, `reviewed_${dto.status}`, req.status, dto.status, dto.review_notes ?? null],
    );

    if (dto.status === 'approved' || dto.status === 'rejected') {
      const event = dto.status === 'approved' ? 'request.approved' : 'request.rejected';
      this.messaging.emit(event, {
        requestId:   updated.id,
        title:       updated.title,
        requesterId: updated.requester_id,
        notes:       dto.review_notes,
      });
    }

    return updated;
  }

  async take(userId: string, requestId: string) {
    const [req] = await this.db.query<{
      id: string; status: string; type: string; priority: string;
      sla_due_at: string | null;
    }[]>(
      `SELECT id, status, type, priority, sla_due_at
       FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);
    if (req.status !== 'pending') throw new BadRequestException('Solo se pueden tomar solicitudes pendientes');

    // Only recalculate SLA if not already set at creation
    let slaDeadline: Date | string = req.sla_due_at ?? '';
    if (!req.sla_due_at) {
      const hours = await this.resolveRequestSlaHours(req.type, req.priority);
      slaDeadline = await this.slaEvaluator.resolveDeadline(hours, new Date(), '');
    }

    const [updated] = await this.db.query<any[]>(
      `UPDATE requests.admin_requests
       SET status     = 'taken',
           taken_at   = now(),
           taken_by   = $1,
           sla_due_at = $3,
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [userId, requestId, slaDeadline],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, old_status, new_status)
       VALUES ($1, $2, 'taken', 'pending', 'taken')`,
      [requestId, userId],
    );

    this.messaging.emit('request.taken', {
      requestId:   updated.id,
      title:       updated.title,
      requesterId: updated.requester_id,
    });

    return updated;
  }

  async untake(userId: string, requestId: string) {
    const [req] = await this.db.query<{
      id: string; status: string; taken_by: string | null;
    }[]>(
      `SELECT id, status, taken_by FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);
    if (req.status !== 'taken') throw new BadRequestException('Solo se puede liberar una solicitud en estado "taken"');

    const [actor] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    if (req.taken_by !== userId && !actor?.is_superadmin) {
      throw new ForbiddenException('Solo quien tomó la solicitud o un superadmin puede liberarla');
    }

    const [updated] = await this.db.query<any[]>(
      `UPDATE requests.admin_requests
       SET status     = 'pending',
           taken_by   = NULL,
           taken_at   = NULL,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, old_status, new_status)
       VALUES ($1, $2, 'untaken', 'taken', 'pending')`,
      [requestId, userId],
    );
    return updated;
  }

  async updateProgress(userId: string, requestId: string, status: 'in_progress' | 'completed', notes?: string) {
    const [req] = await this.db.query<{ id: string; status: string; taken_by: string | null }[]>(
      `SELECT id, status, taken_by FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);

    // Taker, superadmin, or any active gestion module role can advance progress
    if (req.taken_by !== userId) {
      const [actor] = await this.db.query<{ is_superadmin: boolean; has_gestion_role: boolean }[]>(
        `SELECT u.is_superadmin,
                EXISTS (
                  SELECT 1 FROM modules.user_module_roles umr
                  JOIN modules.modules m ON m.id = umr.module_id
                  WHERE umr.user_id = u.id AND umr.is_active = true
                    AND m.permission_scope = 'gestion' AND m.deleted_at IS NULL
                ) AS has_gestion_role
         FROM users.profiles u WHERE u.id = $1`,
        [userId],
      );
      if (!actor?.is_superadmin && !actor?.has_gestion_role)
        throw new ForbiddenException('Solo quien tomó la solicitud o un gestor puede avanzar su estado');
    }

    const validFrom: Record<string, string[]> = {
      in_progress: ['taken'],
      completed:   ['taken', 'in_progress', 'under_review'],
    };
    if (!validFrom[status]?.includes(req.status)) {
      throw new BadRequestException(`No se puede mover de "${req.status}" a "${status}"`);
    }

    const [updated] = await this.db.query<any[]>(
      `UPDATE requests.admin_requests
       SET status       = $1,
           reviewed_by  = $2,
           reviewed_at  = now(),
           review_notes = $3,
           updated_at   = now()
       WHERE id = $4
       RETURNING *`,
      [status, userId, notes ?? null, requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, old_status, new_status, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [requestId, userId, `progress_${status}`, req.status, status, notes ?? null],
    );
    return updated;
  }

  async cancelMine(userId: string, requestId: string) {
    const [req] = await this.db.query<{ id: string; requester_id: string; status: string }[]>(
      `SELECT id, requester_id, status
       FROM requests.admin_requests
       WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);
    if (req.requester_id !== userId) throw new ForbiddenException('No es tu solicitud');
    if (!['pending', 'under_review'].includes(req.status)) {
      throw new ForbiddenException('Solo se pueden cancelar solicitudes pendientes o en revisión');
    }

    await this.db.query(
      `UPDATE requests.admin_requests
       SET status = 'cancelled', updated_at = now()
       WHERE id = $1`,
      [requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline
         (request_id, actor_id, action, old_status, new_status)
       VALUES ($1, $2, 'cancelled', $3, 'cancelled')`,
      [requestId, userId, req.status],
    );
    return { ok: true };
  }

  /* ── Private: SLA hours for requests ────────────────────────────────── */

  private async resolveRequestSlaHours(requestType: string, priority: string): Promise<number> {
    // Type-specific rule first, then global (request_type IS NULL), then hard fallback
    const [specific] = await this.db.query<{ hours_to_resolve: number }[]>(
      `SELECT hours_to_resolve FROM config.sla_rules
       WHERE request_type = $1 AND priority = $2 AND is_active = TRUE LIMIT 1`,
      [requestType, priority],
    );
    if (specific) return specific.hours_to_resolve;

    const [generic] = await this.db.query<{ hours_to_resolve: number }[]>(
      `SELECT hours_to_resolve FROM config.sla_rules
       WHERE request_type IS NULL AND priority = $1 AND is_active = TRUE LIMIT 1`,
      [priority],
    );
    if (generic) return generic.hours_to_resolve;

    return PRIORITY_HOURS[priority] ?? 24;
  }

  async getStats(userId: string, moduleId?: string) {
    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const isSuperadmin = profile?.is_superadmin ?? false;

    const conditions: string[] = ['r.deleted_at IS NULL'];
    const params: unknown[]   = [];

    if (!isSuperadmin) {
      params.push(userId);
      conditions.push(`(r.assigned_to = $${params.length} OR r.metadata->>'module_id' IN (SELECT umr.module_id::text FROM modules.user_module_roles umr WHERE umr.user_id = $${params.length} AND umr.is_active = TRUE))`);
    }
    if (moduleId) {
      params.push(moduleId);
      conditions.push(`r.metadata->>'module_id' = $${params.length}`);
    }

    const scopeClause = `WHERE ${conditions.join(' AND ')}`;

    const [stats] = await this.db.query<any[]>(
      `SELECT
         COUNT(*)                                                               AS total,
         COUNT(*) FILTER (WHERE r.status = 'pending')                         AS pending,
         COUNT(*) FILTER (WHERE r.status = 'taken')                           AS taken,
         COUNT(*) FILTER (WHERE r.status = 'in_progress')                     AS in_progress,
         COUNT(*) FILTER (WHERE r.escalated = TRUE)                           AS escalated,
         COUNT(*) FILTER (WHERE r.sla_due_at < now()
                          AND r.status NOT IN ('completed','approved','rejected','cancelled')) AS sla_breached
       FROM requests.admin_requests r
       ${scopeClause}`,
      params,
    );

    return {
      total:        parseInt(stats.total,        10),
      pending:      parseInt(stats.pending,      10),
      taken:        parseInt(stats.taken,        10),
      in_progress:  parseInt(stats.in_progress,  10),
      escalated:    parseInt(stats.escalated,    10),
      sla_breached: parseInt(stats.sla_breached, 10),
    };
  }

  async getMyStats(userId: string) {
    const [stats] = await this.db.query<any[]>(
      `SELECT
         COUNT(*) FILTER (WHERE r.status = 'pending')                  AS pending,
         COUNT(*) FILTER (WHERE r.status IN ('taken', 'in_progress'))  AS in_progress,
         COUNT(*) FILTER (WHERE r.status IN ('completed', 'approved')) AS completed,
         COUNT(*) FILTER (WHERE r.status = 'rejected')                 AS rejected,
         COUNT(*)                                                       AS total
       FROM requests.admin_requests r
       WHERE r.requester_id = $1 AND r.deleted_at IS NULL`,
      [userId],
    );
    return {
      pending:     parseInt(stats.pending,     10),
      in_progress: parseInt(stats.in_progress, 10),
      completed:   parseInt(stats.completed,   10),
      rejected:    parseInt(stats.rejected,    10),
      total:       parseInt(stats.total,       10),
    };
  }

  async findByUser(targetUserId: string, limit = 10) {
    return this.db.query<any[]>(
      `SELECT r.id, r.type, r.title, r.status, r.priority, r.created_at, r.updated_at,
              r.reviewed_at, r.review_notes, r.task_source
       FROM   requests.admin_requests r
       WHERE  r.requester_id = $1 AND r.deleted_at IS NULL
       ORDER  BY r.created_at DESC
       LIMIT  $2`,
      [targetUserId, limit],
    );
  }

  async getTimeline(requestId: string, userId: string) {
    const [req] = await this.db.query<{ requester_id: string }[]>(
      `SELECT requester_id
       FROM requests.admin_requests
       WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);

    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    // Allow: requester, superadmin, or any user with an active module role (admin/staff)
    const [hasModuleRole] = await this.db.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1 FROM modules.user_module_roles
         WHERE user_id = $1 AND is_active = true
       ) AS exists`,
      [userId],
    );
    const canView = req.requester_id === userId
      || profile?.is_superadmin
      || hasModuleRole?.exists === true;
    if (!canView) throw new ForbiddenException('Sin acceso al timeline de esta solicitud');

    return this.db.query<any[]>(
      `SELECT t.id, t.action, t.old_status, t.new_status, t.notes, t.created_at,
              p.first_name || ' ' || p.last_name AS actor_name
       FROM   requests.request_timeline t
       JOIN   users.profiles            p ON p.id = t.actor_id
       WHERE  t.request_id = $1
       ORDER  BY t.created_at ASC`,
      [requestId],
    );
  }
}
