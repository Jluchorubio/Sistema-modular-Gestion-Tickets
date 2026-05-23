import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateCalendarEventDto {
  title:          string;
  description?:   string;
  event_type?:    'personal' | 'module' | 'global';
  visibility?:    'private' | 'module' | 'participants' | 'global';
  module_id?:     string;
  start_at:       string;
  end_at:         string;
  all_day?:       boolean;
  priority?:      string;
  color?:         string;
  participant_ids?: string[];
}

export interface UpdateCalendarEventDto {
  title?:         string;
  description?:   string;
  start_at?:      string;
  end_at?:        string;
  all_day?:       boolean;
  priority?:      string;
  color?:         string;
  status?:        'active' | 'completed' | 'cancelled';
}

@Injectable()
export class CalendarService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getEvents(
    userId: string,
    isSuperadmin: boolean,
    params: { module_id?: string; start_at?: string; end_at?: string },
  ) {
    const conditions: string[] = ['e.deleted_at IS NULL', `e.status = 'active'`];
    const values: any[] = [];
    let idx = 1;

    if (isSuperadmin) {
      if (params.module_id) {
        conditions.push(`(e.module_id = $${idx++} OR e.event_type = 'personal')`);
        values.push(params.module_id);
      }
    } else {
      // Visibility filter for non-superadmin
      conditions.push(`(
        e.visibility = 'global'
        OR (e.visibility = 'module' AND e.module_id = $${idx++})
        OR (e.created_by = $${idx++})
        OR (e.visibility = 'participants' AND EXISTS (
          SELECT 1 FROM calendar.event_participants ep
          WHERE ep.event_id = e.id AND ep.user_id = $${idx++}
        ))
      )`);
      values.push(params.module_id ?? null, userId, userId);
      idx += 3;
    }

    if (params.start_at) {
      conditions.push(`e.start_at >= $${idx++}`);
      values.push(params.start_at);
    }
    if (params.end_at) {
      conditions.push(`e.end_at <= $${idx++}`);
      values.push(params.end_at);
    }

    return this.db.query<any[]>(
      `SELECT
         e.id, e.title, e.description, e.event_type, e.visibility,
         e.module_id, e.start_at, e.end_at, e.all_day, e.priority,
         e.status, e.color, e.source, e.recurrence_rule, e.created_at,
         e.ticket_id, e.request_id,
         p.first_name || ' ' || p.last_name AS created_by_name,
         m.name AS module_name,
         COUNT(ep.id)::int AS participant_count
       FROM   calendar.events e
       JOIN   users.profiles p ON p.id = e.created_by
       LEFT JOIN modules.modules m ON m.id = e.module_id
       LEFT JOIN calendar.event_participants ep ON ep.event_id = e.id
       WHERE  ${conditions.join(' AND ')}
       GROUP  BY e.id, p.first_name, p.last_name, m.name
       ORDER  BY e.start_at`,
      values,
    );
  }

  async createEvent(userId: string, dto: CreateCalendarEventDto) {
    if (!dto.title?.trim()) throw new BadRequestException('El título es requerido');
    if (!dto.start_at || !dto.end_at) throw new BadRequestException('start_at y end_at son requeridos');
    if (new Date(dto.end_at) < new Date(dto.start_at)) throw new BadRequestException('end_at debe ser >= start_at');

    const [event] = await this.db.query<any[]>(
      `INSERT INTO calendar.events
         (title, description, event_type, visibility, module_id, created_by,
          start_at, end_at, all_day, priority, color)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        dto.title.trim(),
        dto.description?.trim() ?? null,
        dto.event_type   ?? 'personal',
        dto.visibility   ?? 'private',
        dto.module_id    ?? null,
        userId,
        dto.start_at,
        dto.end_at,
        dto.all_day      ?? false,
        dto.priority     ?? 'media',
        dto.color        ?? null,
      ],
    );

    if (dto.participant_ids?.length) {
      for (const pid of dto.participant_ids) {
        await this.db.query(
          `INSERT INTO calendar.event_participants (event_id, user_id, participant_type)
           VALUES ($1, $2, 'user') ON CONFLICT DO NOTHING`,
          [event.id, pid],
        );
      }
    }

    return event;
  }

  async updateEvent(eventId: string, userId: string, isSuperadmin: boolean, dto: UpdateCalendarEventDto) {
    const [event] = await this.db.query<{ id: string; created_by: string }[]>(
      `SELECT id, created_by FROM calendar.events WHERE id = $1 AND deleted_at IS NULL`,
      [eventId],
    );
    if (!event) throw new NotFoundException(`Evento ${eventId} no encontrado`);
    if (!isSuperadmin && event.created_by !== userId) throw new ForbiddenException('Solo el creador puede editar este evento');

    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;

    if (dto.title       !== undefined) { fields.push(`title = $${idx++}`);       values.push(dto.title); }
    if (dto.description !== undefined) { fields.push(`description = $${idx++}`); values.push(dto.description); }
    if (dto.start_at    !== undefined) { fields.push(`start_at = $${idx++}`);    values.push(dto.start_at); }
    if (dto.end_at      !== undefined) { fields.push(`end_at = $${idx++}`);      values.push(dto.end_at); }
    if (dto.all_day     !== undefined) { fields.push(`all_day = $${idx++}`);     values.push(dto.all_day); }
    if (dto.priority    !== undefined) { fields.push(`priority = $${idx++}`);    values.push(dto.priority); }
    if (dto.color       !== undefined) { fields.push(`color = $${idx++}`);       values.push(dto.color); }
    if (dto.status      !== undefined) { fields.push(`status = $${idx++}`);      values.push(dto.status); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');

    values.push(eventId);
    const [updated] = await this.db.query<any[]>(
      `UPDATE calendar.events SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${idx} RETURNING *`,
      values,
    );
    return updated;
  }

  async deleteEvent(eventId: string, userId: string, isSuperadmin: boolean) {
    const [event] = await this.db.query<{ id: string; created_by: string }[]>(
      `SELECT id, created_by FROM calendar.events WHERE id = $1 AND deleted_at IS NULL`,
      [eventId],
    );
    if (!event) throw new NotFoundException(`Evento ${eventId} no encontrado`);
    if (!isSuperadmin && event.created_by !== userId) throw new ForbiddenException('Solo el creador puede eliminar este evento');

    await this.db.query(
      `UPDATE calendar.events SET deleted_at = now(), status = 'cancelled' WHERE id = $1`,
      [eventId],
    );
    return { ok: true };
  }
}
