import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export interface CreateCalendarEventDto {
  title:            string;
  description?:     string;
  event_type?:      'personal' | 'module' | 'global';
  visibility?:      'private' | 'module' | 'participants' | 'global';
  module_id?:       string;
  start_at:         string;
  end_at:           string;
  all_day?:         boolean;
  priority?:        string;
  color?:           string;
  participant_ids?: string[];
}

export interface UpdateCalendarEventDto {
  title?:       string;
  description?: string;
  start_at?:    string;
  end_at?:      string;
  all_day?:     boolean;
  priority?:    string;
  color?:       string;
  status?:      'active' | 'completed' | 'cancelled';
}

interface AuditQueryParams {
  period?: 'day' | 'week' | 'month' | 'year';
  day?:    number;
  week?:   number;
  month?:  number;
  year?:   number;
}

@Injectable()
export class CalendarService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  // ─── Audit helpers ────────────────────────────────────────────────────────────

  private auditLog(
    actorId:    string | null,
    actorType:  'user' | 'system',
    action:     string,
    entityType: string,
    entityId:   string,
    newValue?:  Record<string, any>,
    oldValue?:  Record<string, any>,
  ): void {
    this.db.query(
      `INSERT INTO audit.event_log
         (actor_id, actor_type, action, entity_type, entity_id, new_value, old_value)
       VALUES ($1, $2::actor_type, $3, $4, $5, $6, $7)`,
      [
        actorId,
        actorType,
        action,
        entityType,
        entityId,
        newValue  ? JSON.stringify(newValue)  : null,
        oldValue  ? JSON.stringify(oldValue)  : null,
      ],
    ).catch(() => { /* non-critical */ });
  }

  // ─── Week-of-month range ──────────────────────────────────────────────────────

  private getWeekOfMonthRange(
    week:  number,
    month: number,
    year:  number,
  ): { from: Date; to: Date; label: string } {
    const firstDay  = new Date(year, month - 1, 1);
    const firstDow  = firstDay.getDay(); // 0=Dom..6=Sáb
    const offset    = firstDow === 0 ? 6 : firstDow - 1; // días hasta Lunes
    const firstMon  = new Date(year, month - 1, 1 - offset);

    const from = new Date(firstMon);
    from.setDate(firstMon.getDate() + (week - 1) * 7);
    const to = new Date(from);
    to.setDate(from.getDate() + 6);
    to.setHours(23, 59, 59, 999);

    const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
    const lun  = from.toLocaleDateString('es-CO', opts);
    const dom  = to.toLocaleDateString('es-CO', opts);
    return { from, to, label: `Semana ${week} — Lun ${lun} → Dom ${dom} ${year}` };
  }

  private getCurrentWeekOfMonth(): number {
    const now      = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const firstDow = firstDay.getDay();
    const offset   = firstDow === 0 ? 6 : firstDow - 1;
    const firstMon = new Date(now.getFullYear(), now.getMonth(), 1 - offset);
    return Math.floor((now.getTime() - firstMon.getTime()) / (7 * 86400000)) + 1;
  }

  private getDateRange(p: AuditQueryParams): { from: Date; to: Date; label: string } {
    const now   = new Date();
    const year  = p.year  ?? now.getFullYear();
    const month = p.month ?? (now.getMonth() + 1);

    const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    switch (p.period) {
      case 'day': {
        const d    = p.day ?? now.getDate();
        const from = new Date(year, month - 1, d, 0, 0, 0, 0);
        const to   = new Date(year, month - 1, d, 23, 59, 59, 999);
        const lbl  = from.toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        return { from, to, label: lbl.charAt(0).toUpperCase() + lbl.slice(1) };
      }
      case 'week': {
        const week = p.week ?? this.getCurrentWeekOfMonth();
        return this.getWeekOfMonthRange(week, month, year);
      }
      case 'month': {
        const from = new Date(year, month - 1, 1, 0, 0, 0, 0);
        const to   = new Date(year, month, 0, 23, 59, 59, 999);
        return { from, to, label: `${MONTHS[month - 1]} ${year}` };
      }
      case 'year': {
        const from = new Date(year, 0, 1, 0, 0, 0, 0);
        const to   = new Date(year, 11, 31, 23, 59, 59, 999);
        return { from, to, label: `Año ${year}` };
      }
      default: {
        const week = p.week ?? this.getCurrentWeekOfMonth();
        return this.getWeekOfMonthRange(week, month, year);
      }
    }
  }

  // ─── Get audit ────────────────────────────────────────────────────────────────

  async getAudit(params: {
    period?:    string;
    day?:       number;
    week?:      number;
    month?:     number;
    year?:      number;
    module_id?: string;
    actor_id?:  string;
  }) {
    const { from, to, label } = this.getDateRange({
      period: params.period as AuditQueryParams['period'] ?? 'week',
      day:    params.day,
      week:   params.week,
      month:  params.month,
      year:   params.year,
    });

    const conds: string[] = [
      `el.entity_type IN ('calendar_event', 'calendar_request', 'calendar_reminder')`,
      `el.created_at >= $1`,
      `el.created_at <= $2`,
    ];
    const values: any[] = [from.toISOString(), to.toISOString()];
    let idx = 3;

    if (params.module_id) {
      conds.push(`(el.new_value->>'module_id' = $${idx++} OR el.entity_type = 'calendar_reminder')`);
      values.push(params.module_id);
    }
    if (params.actor_id) {
      conds.push(`el.actor_id = $${idx++}`);
      values.push(params.actor_id);
    }

    const entries = await this.db.query<any[]>(
      `SELECT
         el.id, el.action, el.entity_type, el.entity_id,
         el.new_value, el.old_value, el.actor_type, el.created_at,
         COALESCE(p.first_name || ' ' || p.last_name, 'Sistema') AS actor_name,
         c.email AS actor_email
       FROM   audit.event_log el
       LEFT JOIN users.profiles   p ON p.id = el.actor_id
       LEFT JOIN auth.credentials c ON c.user_id = el.actor_id
       WHERE  ${conds.join(' AND ')}
       ORDER  BY el.created_at DESC
       LIMIT  200`,
      values,
    );

    return {
      range:   { from: from.toISOString(), to: to.toISOString(), label },
      total:   entries.length,
      entries,
    };
  }

  // ─── Calendar events CRUD ─────────────────────────────────────────────────────

  async getEvents(
    userId:      string,
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

    if (params.start_at) { conditions.push(`e.start_at >= $${idx++}`); values.push(params.start_at); }
    if (params.end_at)   { conditions.push(`e.end_at <= $${idx++}`);   values.push(params.end_at);   }

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

  async createEvent(userId: string, dto: CreateCalendarEventDto, isSuperadmin = false) {
    if (!dto.title?.trim())          throw new BadRequestException('El título es requerido');
    if (!dto.start_at || !dto.end_at) throw new BadRequestException('start_at y end_at son requeridos');
    if (new Date(dto.end_at) < new Date(dto.start_at))
      throw new BadRequestException('end_at debe ser >= start_at');
    if (!isSuperadmin && !dto.all_day && new Date(dto.start_at) < new Date())
      throw new BadRequestException('No puedes crear eventos en el pasado');

    const [event] = await this.db.query<any[]>(
      `INSERT INTO calendar.events
         (title, description, event_type, visibility, module_id, created_by,
          start_at, end_at, all_day, priority, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       RETURNING *`,
      [
        dto.title.trim(),
        dto.description?.trim() ?? null,
        dto.event_type  ?? 'personal',
        dto.visibility  ?? 'private',
        dto.module_id   ?? null,
        userId,
        dto.start_at,
        dto.end_at,
        dto.all_day     ?? false,
        dto.priority    ?? 'media',
        dto.color       ?? null,
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

    this.auditLog(userId, 'user', 'calendar.event.created', 'calendar_event', event.id, {
      title:      event.title,
      event_type: event.event_type,
      module_id:  event.module_id,
      start_at:   event.start_at,
      visibility: event.visibility,
    });

    return event;
  }

  async updateEvent(
    eventId:      string,
    userId:       string,
    isSuperadmin: boolean,
    dto:          UpdateCalendarEventDto,
  ) {
    const [existing] = await this.db.query<{
      id: string; created_by: string; title: string; module_id: string | null;
      start_at: string; end_at: string | null; all_day: boolean;
    }[]>(
      `SELECT id, created_by, title, module_id, start_at, end_at, all_day
       FROM calendar.events WHERE id = $1 AND deleted_at IS NULL`,
      [eventId],
    );
    if (!existing) throw new NotFoundException(`Evento ${eventId} no encontrado`);
    if (!isSuperadmin && existing.created_by !== userId)
      throw new ForbiddenException('Solo el creador puede editar este evento');

    const effectiveStart = dto.start_at ?? existing.start_at;
    const effectiveEnd   = dto.end_at   ?? existing.end_at;
    const isAllDay       = dto.all_day  ?? existing.all_day;
    if (!isAllDay && effectiveEnd && new Date(effectiveEnd) < new Date(effectiveStart))
      throw new BadRequestException('La fecha de fin no puede ser anterior a la fecha de inicio');

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

    this.auditLog(userId, 'user', 'calendar.event.updated', 'calendar_event', eventId, {
      title:     updated.title,
      module_id: existing.module_id,
      changes:   Object.keys(dto),
    }, { title: existing.title });

    return updated;
  }

  async deleteEvent(eventId: string, userId: string, isSuperadmin: boolean) {
    const [event] = await this.db.query<{ id: string; created_by: string; title: string; module_id: string | null }[]>(
      `SELECT id, created_by, title, module_id FROM calendar.events WHERE id = $1 AND deleted_at IS NULL`,
      [eventId],
    );
    if (!event) throw new NotFoundException(`Evento ${eventId} no encontrado`);
    if (!isSuperadmin && event.created_by !== userId)
      throw new ForbiddenException('Solo el creador puede eliminar este evento');

    await this.db.query(
      `UPDATE calendar.events SET deleted_at = now(), status = 'cancelled' WHERE id = $1`,
      [eventId],
    );

    this.auditLog(userId, 'user', 'calendar.event.deleted', 'calendar_event', eventId, {
      title:     event.title,
      module_id: event.module_id,
    });

    return { ok: true };
  }
}
