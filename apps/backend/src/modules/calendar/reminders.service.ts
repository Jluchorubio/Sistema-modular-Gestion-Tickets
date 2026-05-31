import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  @Cron('*/5 * * * *', { name: 'calendar-reminders' })
  async sendReminders() {
    await Promise.all([
      this.remindCalendarEvents(),
      this.remindMeetings(),
    ]);
  }

  /* ── Calendar events ─────────────────────────────────────────────────────── */

  private async remindCalendarEvents() {
    const events = await this.db.query<{
      id: string; title: string; start_at: string;
      created_by: string; participant_ids: string[] | null;
    }[]>(`
      SELECT e.id, e.title, e.start_at, e.created_by,
             ARRAY_AGG(DISTINCT ep.user_id) FILTER (WHERE ep.user_id IS NOT NULL) AS participant_ids
      FROM   calendar.events e
      LEFT JOIN calendar.event_participants ep ON ep.event_id = e.id
      WHERE  e.status     = 'active'
        AND  e.all_day    = false
        AND  e.deleted_at IS NULL
        AND  e.start_at BETWEEN now() + interval '25 minutes'
                            AND now() + interval '35 minutes'
      GROUP  BY e.id
    `);

    for (const ev of events) {
      const recipients = [...new Set([ev.created_by, ...(ev.participant_ids ?? [])])];
      const time = new Date(ev.start_at).toLocaleTimeString('es-CO', {
        hour: '2-digit', minute: '2-digit',
      });

      for (const userId of recipients) {
        if (!userId) continue;
        if (await this.wasReminderSent(userId, 'reminder.calendar_event', ev.id, 'eventId')) continue;

        await this.notifications.notifyUser({
          userId,
          eventType: 'reminder.calendar_event',
          subject:   `Recordatorio: "${ev.title}" en 30 minutos`,
          body:      `El evento "${ev.title}" comienza a las ${time}. ¡No olvides conectarte!`,
          channels:  ['in_app', 'email'],
          meta:      { eventId: ev.id },
        }).catch((err: Error) => this.logger.error(`reminder cal event: ${err.message}`));

        this.auditLog(null, 'system', 'calendar.reminder.calendar_event', 'calendar_reminder', ev.id, {
          entity_title: ev.title,
          channel:      'in_app+email',
          recipient_id: userId,
          scheduled_at: ev.start_at,
        });
      }
    }
  }

  /* ── Ticket meetings ─────────────────────────────────────────────────────── */

  private async remindMeetings() {
    const meetings = await this.db.query<{
      id: string; ticket_title: string; scheduled_at: string;
      provider: string; meeting_url: string | null;
      participant_ids: string[] | null;
    }[]>(`
      SELECT tm.id, t.title AS ticket_title, tm.scheduled_at,
             tm.provider, tm.meeting_url,
             ARRAY_AGG(DISTINCT mp.user_id) FILTER (WHERE mp.user_id IS NOT NULL) AS participant_ids
      FROM   tickets.ticket_meetings tm
      JOIN   tickets.tickets t   ON t.id  = tm.ticket_id
      LEFT JOIN tickets.meeting_participants mp ON mp.meeting_id = tm.id
      WHERE  tm.status = 'scheduled'
        AND  tm.scheduled_at BETWEEN now() + interval '25 minutes'
                                 AND now() + interval '35 minutes'
      GROUP  BY tm.id, t.title
    `);

    for (const m of meetings) {
      const time     = new Date(m.scheduled_at).toLocaleTimeString('es-CO', {
        hour: '2-digit', minute: '2-digit',
      });
      const platform = m.provider.replace(/_/g, ' ');
      const urlPart  = m.meeting_url ? ` Enlace: ${m.meeting_url}` : '';

      for (const userId of m.participant_ids ?? []) {
        if (!userId) continue;
        if (await this.wasReminderSent(userId, 'reminder.meeting', m.id, 'meetingId')) continue;

        await this.notifications.notifyUser({
          userId,
          eventType: 'reminder.meeting',
          subject:   `Reunión en 30 min: ${m.ticket_title}`,
          body:      `La reunión para "${m.ticket_title}" comienza a las ${time} vía ${platform}.${urlPart}`,
          channels:  ['in_app', 'email'],
          meta:      { meetingId: m.id },
        }).catch((err: Error) => this.logger.error(`reminder meeting: ${err.message}`));

        this.auditLog(null, 'system', 'calendar.reminder.meeting', 'calendar_reminder', m.id, {
          entity_title: m.ticket_title,
          channel:      'in_app+email',
          recipient_id: userId,
          scheduled_at: m.scheduled_at,
          provider:     m.provider,
        });
      }
    }
  }

  /* ── Dedup helper ────────────────────────────────────────────────────────── */

  private async wasReminderSent(
    userId:    string,
    eventType: string,
    entityId:  string,
    metaKey:   string,
  ): Promise<boolean> {
    const [row] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM notifications.notification_logs
       WHERE  user_id    = $1
         AND  event_type = $2
         AND  payload->>$3 = $4
         AND  created_at  > now() - interval '2 hours'
       LIMIT  1`,
      [userId, eventType, metaKey, entityId],
    );
    return !!row;
  }

  /* ── Audit ───────────────────────────────────────────────────────────────── */

  private auditLog(
    actorId:    string | null,
    actorType:  'user' | 'system',
    action:     string,
    entityType: string,
    entityId:   string,
    newValue?:  Record<string, any>,
  ): void {
    this.db.query(
      `INSERT INTO audit.event_log
         (actor_id, actor_type, action, entity_type, entity_id, new_value)
       VALUES ($1, $2::actor_type, $3, $4, $5, $6)`,
      [actorId, actorType, action, entityType, entityId, newValue ? JSON.stringify(newValue) : null],
    ).catch(() => { /* non-critical */ });
  }
}
