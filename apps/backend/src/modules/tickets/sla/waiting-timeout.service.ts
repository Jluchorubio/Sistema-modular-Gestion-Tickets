import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class WaitingTimeoutService {
  private readonly logger = new Logger(WaitingTimeoutService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  /** Runs daily at 09:00. Finds tickets stuck in en_espera longer than
   *  the module's waiting_timeout_hours (default 72h) and notifies the
   *  assigned technician + all jefe_tecnico of the module. */
  @Cron('0 9 * * *', { name: 'waiting-timeout-check' })
  async run(): Promise<void> {
    try {
      await this.checkWaitingTimeouts();
    } catch (err: any) {
      this.logger.error(`Waiting timeout check failed: ${err.message}`);
    }
  }

  private async checkWaitingTimeouts(): Promise<void> {
    const stuck = await this.db.query<{
      ticket_id:  string;
      title:      string;
      module_id:  string;
      created_by: string;
      owner_id:   string | null;
      paused_at:  string;
      timeout_h:  number;
    }[]>(`
      SELECT t.id                         AS ticket_id,
             t.title,
             t.module_id,
             t.created_by,
             ta.user_id                   AS owner_id,
             tsh.transitioned_at          AS paused_at,
             COALESCE(m.waiting_timeout_hours, 72) AS timeout_h
      FROM   tickets.tickets  t
      JOIN   tickets.states   s   ON s.id = t.current_state_id AND s.is_pause_state = true
      JOIN   modules.modules  m   ON m.id = t.module_id
      JOIN   LATERAL (
               SELECT to_state_id, transitioned_at
               FROM   tickets.ticket_state_history
               WHERE  ticket_id = t.id AND to_state_id = t.current_state_id
               ORDER  BY transitioned_at DESC
               LIMIT  1
             ) tsh ON true
      LEFT JOIN tickets.ticket_assignments ta
             ON ta.ticket_id = t.id AND ta.role = 'owner' AND ta.is_active = true
      WHERE  t.deleted_at IS NULL
        AND  tsh.transitioned_at < now() - (COALESCE(m.waiting_timeout_hours, 72) || ' hours')::interval
      LIMIT  200
    `);

    if (!stuck.length) return;
    this.logger.log(`Waiting timeout: ${stuck.length} ticket(s) past pause threshold`);

    for (const t of stuck) {
      try {
        await this.notifyStuckTicket(t);
      } catch (err: any) {
        this.logger.error(`Waiting timeout notify ticket ${t.ticket_id}: ${err.message}`);
      }
    }
  }

  private async notifyStuckTicket(t: {
    ticket_id: string; title: string; module_id: string;
    created_by: string; owner_id: string | null; timeout_h: number;
  }): Promise<void> {
    const timeoutDays = Math.round(t.timeout_h / 24);
    const subject = `Ticket en espera: ${t.title}`;
    const body    = `El ticket "${t.title}" lleva más de ${timeoutDays} día${timeoutDays !== 1 ? 's' : ''} en estado "En espera" sin actividad. Verifica si el solicitante respondió o retoma el ticket.`;

    // Notify assigned technician
    if (t.owner_id) {
      await this.notifications.notifyUser({
        userId:    t.owner_id,
        eventType: 'ticket.waiting_timeout',
        subject,
        body,
        channels:  ['in_app'],
        meta:      { ticketId: t.ticket_id, moduleId: t.module_id },
      });
    }

    // Notify all jefe_tecnico of the module
    const chiefs = await this.db.query<{ user_id: string }[]>(
      `SELECT umr.user_id
       FROM   modules.user_module_roles umr
       JOIN   modules.module_roles      mr ON mr.id = umr.role_id
       WHERE  umr.module_id = $1 AND mr.name = 'jefe_tecnico' AND umr.is_active = true`,
      [t.module_id],
    );

    for (const { user_id } of chiefs) {
      if (user_id === t.owner_id) continue; // already notified above
      await this.notifications.notifyUser({
        userId:    user_id,
        eventType: 'ticket.waiting_timeout',
        subject,
        body,
        channels:  ['in_app'],
        meta:      { ticketId: t.ticket_id, moduleId: t.module_id },
      });
    }
  }
}
