import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateRequestDto } from './dto/create-request.dto';
import { ReviewRequestDto } from './dto/review-request.dto';

@Injectable()
export class RequestsService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async create(requesterId: string, dto: CreateRequestDto) {
    const [row] = await this.db.query<any[]>(
      `INSERT INTO requests.admin_requests (requester_id, type, title, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [requesterId, dto.type, dto.title.trim(), dto.description.trim()],
    );
    return row;
  }

  async findAll(opts: { status?: string; type?: string; page?: number; limit?: number }) {
    const page   = Math.max(1, opts.page  ?? 1);
    const limit  = Math.min(100, Math.max(1, opts.limit ?? 20));
    const offset = (page - 1) * limit;

    const conditions: string[] = ['r.deleted_at IS NULL'];
    const params: unknown[]    = [];

    if (opts.status) { params.push(opts.status); conditions.push(`r.status = $${params.length}`); }
    if (opts.type)   { params.push(opts.type);   conditions.push(`r.type   = $${params.length}`); }

    const where = `WHERE ${conditions.join(' AND ')}`;

    params.push(limit, offset);
    const li = params.length - 1;
    const oi = params.length;

    const rows = await this.db.query<any[]>(
      `SELECT r.id, r.type, r.title, r.description, r.status,
              r.created_at, r.updated_at, r.reviewed_at, r.review_notes,
              p.first_name || ' ' || p.last_name AS requester_name,
              p.id                               AS requester_id,
              c.email                            AS requester_email,
              rv.first_name || ' ' || rv.last_name AS reviewer_name
       FROM   requests.admin_requests r
       JOIN   users.profiles          p  ON p.id = r.requester_id
       JOIN   auth.credentials        c  ON c.user_id = p.id
       LEFT JOIN users.profiles       rv ON rv.id = r.reviewed_by
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
      `SELECT r.id, r.type, r.title, r.description, r.status,
              r.created_at, r.updated_at, r.reviewed_at, r.review_notes,
              rv.first_name || ' ' || rv.last_name AS reviewer_name
       FROM   requests.admin_requests r
       LEFT JOIN users.profiles rv ON rv.id = r.reviewed_by
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
      `SELECT id, status FROM requests.admin_requests WHERE id = $1`,
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
    return updated;
  }

  async cancelMine(userId: string, requestId: string) {
    const [req] = await this.db.query<{ id: string; requester_id: string; status: string }[]>(
      `SELECT id, requester_id, status FROM requests.admin_requests WHERE id = $1`,
      [requestId],
    );
    if (!req) throw new NotFoundException(`Solicitud ${requestId} no encontrada`);
    if (req.requester_id !== userId) throw new ForbiddenException('No es tu solicitud');
    if (req.status !== 'pending') throw new ForbiddenException('Solo se pueden cancelar solicitudes pendientes');

    await this.db.query(
      `DELETE FROM requests.admin_requests WHERE id = $1`,
      [requestId],
    );
    return { ok: true };
  }
}
