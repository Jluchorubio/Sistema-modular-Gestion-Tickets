import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';

interface BreachedTicket {
  ticket_id:    string;
  title:        string;
  module_id:    string;
  module_name:  string;
  priority:     string;
  tracking_id:  string;
  assignee_id:  string | null;
  creator_id:   string;
  tech_chief_id: string | null;
}

@Injectable()
export class SlaBreachService {
  private readonly logger = new Logger(SlaBreachService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
  ) {}

  // Runs every 15 minutes
  @Cron('0 */15 * * * *')
  async detectBreaches(): Promise<void> {
    try {
      await this.runBreachCycle();
    } catch (err: any) {
      this.logger.error(`SLA breach cycle failed: ${err.message}`);
    }
  }

  private async runBreachCycle(): Promise<void> {
    // 1. Mark breached records and get affected tickets in one query
    const breached = await this.db.query<BreachedTicket[]>(
      `UPDATE tickets.ticket_sla_tracking trk
       SET status      = 'breached',
           breached_at = now(),
           updated_at  = now()
       FROM tickets.tickets t
       JOIN modules.modules m ON m.id = t.module_id
       WHERE trk.ticket_id  = t.id
         AND trk.status      = 'active'
         AND trk.deadline_at < now()
         AND t.deleted_at    IS NULL
       RETURNING
         t.id          AS ticket_id,
         t.title,
         t.module_id,
         m.name        AS module_name,
         t.priority,
         trk.id        AS tracking_id,
         t.created_by  AS creator_id,
         (
           SELECT ta.user_id
           FROM   tickets.ticket_assignments ta
           WHERE  ta.ticket_id = t.id AND ta.is_active = true
           LIMIT  1
         )             AS assignee_id,
         (
           SELECT umr.user_id
           FROM   modules.user_module_roles umr
           JOIN   modules.module_roles      mr ON mr.id = umr.role_id
           WHERE  umr.module_id = t.module_id
             AND  umr.is_active = true
             AND  mr.name       = 'jefe_tecnico'
           LIMIT  1
         )             AS tech_chief_id`,
    );

    if (!breached.length) return;

    this.logger.warn(`SLA breach detected: ${breached.length} ticket(s)`);

    // 2. Notify for each breached ticket (fire-and-forget per ticket)
    await Promise.allSettled(breached.map(t => this.notifyBreach(t)));
  }

  private async notifyBreach(ticket: BreachedTicket): Promise<void> {
    const subject = `⚠ SLA vencido — ${ticket.title}`;
    const body    = `El ticket "${ticket.title}" (${ticket.priority}) en módulo ${ticket.module_name} superó su tiempo de resolución SLA.`;

    const targets = new Set<string>();
    if (ticket.assignee_id)                          targets.add(ticket.assignee_id);
    if (ticket.tech_chief_id)                        targets.add(ticket.tech_chief_id);
    if (!ticket.assignee_id && ticket.creator_id)    targets.add(ticket.creator_id);

    await Promise.allSettled(
      Array.from(targets).map(userId =>
        this.notifications.notifyUser({
          userId,
          eventType: 'ticket.sla_breached',
          subject,
          body,
          channels: ['in_app'],
          meta: {
            ticket_id:   ticket.ticket_id,
            module_id:   ticket.module_id,
            module_name: ticket.module_name,
            priority:    ticket.priority,
          },
        }),
      ),
    );
  }

  // Manual trigger for admin / testing
  async triggerManual(): Promise<{ breached: number }> {
    const before = await this.countActiveBreached();
    await this.runBreachCycle();
    return { breached: before };
  }

  private async countActiveBreached(): Promise<number> {
    const [{ count }] = await this.db.query<{ count: string }[]>(
      `SELECT count(*) FROM tickets.ticket_sla_tracking
       WHERE status = 'active' AND deadline_at < now()`,
    );
    return Number(count);
  }
}
