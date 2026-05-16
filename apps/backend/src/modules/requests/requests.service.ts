import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateRequestDto } from './dto/create-request.dto';
import { ReviewRequestDto } from './dto/review-request.dto';

@Injectable()
export class RequestsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async create(requesterId: string, dto: CreateRequestDto & { task_source?: 'user' | 'system' }) {
    const metaJson   = dto.metadata ? JSON.stringify(dto.metadata) : null;
    const taskSource = dto.task_source === 'system' ? 'system' : 'user';
    const [row] = await this.db.query<any[]>(
      `INSERT INTO requests.admin_requests (requester_id, type, title, description, priority, metadata, task_source)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [requesterId, dto.type, dto.title.trim(), dto.description.trim(), dto.priority ?? 'media', metaJson, taskSource],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, new_status)
       VALUES ($1, $2, 'created', 'pending')`,
      [row.id, requesterId],
    );
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

  async findAll(userId: string, opts: { status?: string; type?: string; source?: string; escalated?: boolean; page?: number; limit?: number }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;

    // Determine scope: superadmin sees all; admin_modulo sees only their modules' requests
    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    const isSuperadmin = profile?.is_superadmin ?? false;

    const conditions: string[] = ['r.deleted_at IS NULL'];
    const params: unknown[]    = [];

    if (!isSuperadmin) {
      params.push(userId);
      conditions.push(`(
        r.metadata->>'module_id' IN (
          SELECT umr.module_id::text
          FROM   modules.user_module_roles umr
          JOIN   modules.module_roles      mr ON mr.id = umr.role_id
          WHERE  umr.user_id   = $${params.length}
            AND  umr.is_active = true
            AND  mr.name       = 'admin_modulo'
        )
      )`);
    }

    if (opts.status)              { params.push(opts.status);  conditions.push(`r.status      = $${params.length}`); }
    if (opts.type)                { params.push(opts.type);    conditions.push(`r.type        = $${params.length}`); }
    if (opts.source)              { params.push(opts.source);  conditions.push(`r.task_source = $${params.length}`); }
    if (opts.escalated === true)  { conditions.push(`r.escalated = TRUE`); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    params.push(limit, offset);
    const li = params.length - 1;
    const oi = params.length;

    const rows = await this.db.query<any[]>(
      `SELECT r.id, r.type, r.title, r.description, r.status, r.priority,
              r.metadata, r.created_at, r.updated_at, r.reviewed_at, r.review_notes,
              r.taken_at, r.sla_due_at, r.task_source,
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
              r.taken_at, r.sla_due_at, r.task_source,
              r.escalated, r.escalated_at, r.escalation_note,
              rv.first_name || ' ' || rv.last_name AS reviewer_name,
              tb.first_name || ' ' || tb.last_name AS taken_by_name
       FROM   requests.admin_requests r
       LEFT JOIN users.profiles rv ON rv.id = r.reviewed_by
       LEFT JOIN users.profiles tb ON tb.id = r.taken_by
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
    const [req] = await this.db.query<{ id: string; status: string }[]>(
      `SELECT id, status FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);

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
    return updated;
  }

  async take(userId: string, requestId: string) {
    const [req] = await this.db.query<{ id: string; status: string }[]>(
      `SELECT id, status FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);
    if (req.status !== 'pending') throw new BadRequestException('Solo se pueden tomar solicitudes pendientes');

    const [updated] = await this.db.query<any[]>(
      `UPDATE requests.admin_requests
       SET status     = 'taken',
           taken_at   = now(),
           taken_by   = $1,
           sla_due_at = now() + INTERVAL '4 hours',
           updated_at = now()
       WHERE id = $2
       RETURNING *`,
      [userId, requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, old_status, new_status)
       VALUES ($1, $2, 'taken', 'pending', 'taken')`,
      [requestId, userId],
    );
    return updated;
  }

  async updateProgress(userId: string, requestId: string, status: 'in_progress' | 'completed') {
    const [req] = await this.db.query<{ id: string; status: string }[]>(
      `SELECT id, status FROM requests.admin_requests WHERE id = $1 AND deleted_at IS NULL`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);

    const validFrom: Record<string, string[]> = {
      in_progress: ['taken'],
      completed:   ['taken', 'in_progress'],
    };
    if (!validFrom[status]?.includes(req.status)) {
      throw new BadRequestException(`No se puede mover de "${req.status}" a "${status}"`);
    }

    const [updated] = await this.db.query<any[]>(
      `UPDATE requests.admin_requests
       SET status      = $1,
           reviewed_by = $2,
           reviewed_at = now(),
           updated_at  = now()
       WHERE id = $3
       RETURNING *`,
      [status, userId, requestId],
    );
    await this.db.query(
      `INSERT INTO requests.request_timeline (request_id, actor_id, action, old_status, new_status)
       VALUES ($1, $2, $3, $4, $5)`,
      [requestId, userId, `progress_${status}`, req.status, status],
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
    const canView = req.requester_id === userId || profile?.is_superadmin;
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
