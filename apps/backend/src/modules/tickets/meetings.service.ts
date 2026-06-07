import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MessagingService } from '../../shared/messaging/messaging.service';

export type MeetingProvider = 'google_meet' | 'teams' | 'zoom' | 'internal';
export type MeetingStatus   = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface CreateMeetingDto {
  reason:            string;
  provider:          MeetingProvider;
  meeting_url?:      string;
  scheduled_at:      string;
  duration_minutes?: number;
  participant_ids?:  string[];
}

@Injectable()
export class MeetingsService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly messaging: MessagingService,
  ) {}

  async getMeetings(ticketId: string) {
    return this.db.query<any[]>(
      `SELECT
         tm.id, tm.provider, tm.meeting_url, tm.reason, tm.status,
         tm.scheduled_at, tm.duration_minutes, tm.created_at,
         p.first_name || ' ' || p.last_name AS created_by_name,
         COUNT(mp.id)::int                  AS participant_count
       FROM   tickets.ticket_meetings tm
       JOIN   users.profiles p  ON p.id = tm.created_by
       LEFT JOIN tickets.meeting_participants mp ON mp.meeting_id = tm.id
       WHERE  tm.ticket_id = $1
       GROUP  BY tm.id, p.first_name, p.last_name
       ORDER  BY tm.scheduled_at`,
      [ticketId],
    );
  }

  async createMeeting(actorId: string, ticketId: string, dto: CreateMeetingDto) {
    const validProviders: MeetingProvider[] = ['google_meet', 'teams', 'zoom', 'internal'];
    if (!validProviders.includes(dto.provider)) {
      throw new BadRequestException(`Proveedor inválido: ${dto.provider}`);
    }

    if (dto.meeting_url) {
      try { new URL(dto.meeting_url); } catch {
        throw new BadRequestException('El enlace de reunión no es una URL válida.');
      }
      if (!dto.meeting_url.startsWith('https://') && !dto.meeting_url.startsWith('http://')) {
        throw new BadRequestException('El enlace de reunión debe comenzar con https:// o http://');
      }
    }

    const [ticket] = await this.db.query<{ id: string; module_id: string }[]>(
      `SELECT id, module_id FROM tickets.tickets WHERE id = $1`,
      [ticketId],
    );
    if (!ticket) throw new NotFoundException(`Ticket ${ticketId} no encontrado`);

    const [meeting] = await this.db.query<any[]>(
      `INSERT INTO tickets.ticket_meetings
         (ticket_id, module_id, created_by, provider, meeting_url, reason, scheduled_at, duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        ticketId,
        ticket.module_id,
        actorId,
        dto.provider,
        dto.meeting_url ?? null,
        dto.reason,
        dto.scheduled_at,
        dto.duration_minutes ?? null,
      ],
    );

    if (dto.participant_ids?.length) {
      for (const userId of dto.participant_ids) {
        await this.db.query(
          `INSERT INTO tickets.meeting_participants (meeting_id, user_id, role)
           VALUES ($1, $2, 'attendee') ON CONFLICT DO NOTHING`,
          [meeting.id, userId],
        );
      }
    }

    // Host is always the creator
    await this.db.query(
      `INSERT INTO tickets.meeting_participants (meeting_id, user_id, role)
       VALUES ($1, $2, 'host') ON CONFLICT DO NOTHING`,
      [meeting.id, actorId],
    );

    const [ticketRow] = await this.db.query<{ title: string }[]>(
      `SELECT title FROM tickets.tickets WHERE id = $1`,
      [ticketId],
    );
    const allParticipants = [...(dto.participant_ids ?? []), actorId];
    this.messaging.emit('meeting.scheduled', {
      meetingId:      meeting.id,
      ticketId,
      ticketTitle:    ticketRow?.title ?? ticketId,
      scheduledAt:    dto.scheduled_at,
      participantIds: [...new Set(allParticipants)],
    });

    return meeting;
  }

  async updateMeeting(meetingId: string, actorId: string, dto: { status?: MeetingStatus; meeting_url?: string }) {
    const fields: string[] = [];
    const values: any[]   = [];
    let idx = 1;

    if (dto.status     !== undefined) { fields.push(`status = $${idx++}`);      values.push(dto.status); }
    if (dto.meeting_url !== undefined) { fields.push(`meeting_url = $${idx++}`); values.push(dto.meeting_url); }
    if (!fields.length) throw new BadRequestException('Nada que actualizar');

    values.push(meetingId);
    const [row] = await this.db.query<any[]>(
      `UPDATE tickets.ticket_meetings SET ${fields.join(', ')}, updated_at = now()
       WHERE id = $${idx} RETURNING *`,
      values,
    );
    if (!row) throw new NotFoundException(`Reunión ${meetingId} no encontrada`);
    return row;
  }

  async getCalendarMeetings(userId: string, moduleId?: string) {
    const [actor] = await this.db.query<any[]>(`SELECT is_superadmin FROM users.profiles WHERE id = $1`, [userId]);
    const isSuperadmin: boolean = actor?.is_superadmin ?? false;
    const conditions: string[] = [`tm.status IN ('scheduled','active')`];
    const values: any[] = [];
    let idx = 1;

    if (isSuperadmin) {
      if (moduleId) {
        conditions.push(`tm.module_id = $${idx++}`);
        values.push(moduleId);
      }
    } else if (moduleId) {
      conditions.push(`tm.module_id = $${idx++}`);
      values.push(moduleId);
    } else {
      conditions.push(`(tm.created_by = $${idx} OR EXISTS (
        SELECT 1 FROM tickets.meeting_participants mp2
        WHERE mp2.meeting_id = tm.id AND mp2.user_id = $${idx}
      ))`);
      values.push(userId);
      idx++;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.db.query<any[]>(
      `SELECT
         tm.id, tm.ticket_id, tm.module_id, tm.provider, tm.meeting_url,
         tm.reason, tm.status, tm.scheduled_at, tm.duration_minutes, tm.created_at,
         t.title       AS ticket_title,
         mn.name       AS module_name,
         p.first_name || ' ' || p.last_name AS created_by_name,
         COUNT(mp.id)::int AS participant_count
       FROM   tickets.ticket_meetings tm
       JOIN   tickets.tickets   t  ON t.id  = tm.ticket_id
       JOIN   modules.modules   mn ON mn.id = tm.module_id
       JOIN   users.profiles    p  ON p.id  = tm.created_by
       LEFT JOIN tickets.meeting_participants mp ON mp.meeting_id = tm.id
       ${where}
       GROUP  BY tm.id, t.title, mn.name, p.first_name, p.last_name
       ORDER  BY tm.scheduled_at`,
      values,
    );
  }

  async cancelMeeting(meetingId: string, actorId: string) {
    const [meeting] = await this.db.query<{ id: string; status: string; created_by: string }[]>(
      `SELECT id, status, created_by FROM tickets.ticket_meetings WHERE id = $1`,
      [meetingId],
    );
    if (!meeting) throw new NotFoundException(`Reunión ${meetingId} no encontrada`);
    if (meeting.status === 'cancelled') throw new BadRequestException('Ya estaba cancelada');

    await this.db.query(
      `UPDATE tickets.ticket_meetings SET status = 'cancelled', updated_at = now() WHERE id = $1`,
      [meetingId],
    );
    return { ok: true };
  }
}
