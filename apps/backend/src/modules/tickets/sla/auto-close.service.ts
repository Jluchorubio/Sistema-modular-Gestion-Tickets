import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MessagingService } from '../../../shared/messaging/messaging.service';

@Injectable()
export class AutoCloseService {
  private readonly logger = new Logger(AutoCloseService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly messaging: MessagingService,
  ) {}

  /** Runs every hour. Closes tickets that have been in resuelto (approval state)
   *  longer than the module's auto_close_hours setting. */
  @Cron('0 * * * *', { name: 'auto-close-tickets' })
  async runAutoClose(): Promise<void> {
    try {
      await this.closeExpiredResolved();
    } catch (err: any) {
      this.logger.error(`Auto-close cycle failed: ${err.message}`);
    }
  }

  private async closeExpiredResolved(): Promise<void> {
    const tickets = await this.db.query<{
      ticket_id:      string;
      title:          string;
      created_by:     string;
      close_state_id: string;
    }[]>(`
      WITH approval_tickets AS (
        SELECT t.id                      AS ticket_id,
               t.title,
               t.created_by,
               t.workflow_version_id,
               t.current_state_id,
               tsh.transitioned_at       AS entered_approval_at,
               m.auto_close_hours
        FROM   tickets.tickets  t
        JOIN   tickets.states   s   ON s.id = t.current_state_id   AND s.is_approval_state = true
        JOIN   modules.modules  m   ON m.id = t.module_id
                                   AND m.auto_close_hours IS NOT NULL
                                   AND m.auto_close_hours > 0
        JOIN   LATERAL (
                 SELECT to_state_id, transitioned_at
                 FROM   tickets.ticket_state_history
                 WHERE  ticket_id = t.id AND to_state_id = t.current_state_id
                 ORDER  BY transitioned_at DESC
                 LIMIT  1
               ) tsh ON true
        WHERE  t.deleted_at IS NULL
          AND  tsh.transitioned_at < now() - (m.auto_close_hours || ' hours')::interval
      )
      SELECT at.ticket_id,
             at.title,
             at.created_by,
             tr.to_state_id AS close_state_id
      FROM   approval_tickets at
      JOIN   tickets.transitions tr ON tr.workflow_version_id = at.workflow_version_id
                                    AND tr.from_state_id       = at.current_state_id
                                    AND tr.is_active           = true
      JOIN   tickets.states ts2     ON ts2.id = tr.to_state_id AND ts2.is_final = true
      LIMIT  100
    `);

    if (!tickets.length) return;
    this.logger.log(`Auto-closing ${tickets.length} ticket(s) past approval timeout`);

    for (const t of tickets) {
      const qr = this.db.createQueryRunner();
      await qr.connect();
      await qr.startTransaction();
      try {
        // set_config local=true → transaction-scoped; trigger fn_ticket_state_history
        // reads it via get_current_user_id() which falls back to superadmin UUID on cast error.
        await qr.query(`SELECT set_config('app.current_user_id', 'system', true)`);

        await qr.query(
          `UPDATE tickets.tickets SET current_state_id = $1 WHERE id = $2`,
          [t.close_state_id, t.ticket_id],
        );

        // Close SLA tracking — to_state is always is_final=true (guaranteed by query above)
        await qr.query(
          `UPDATE tickets.ticket_sla_tracking
           SET status      = CASE WHEN deadline_at < now() THEN 'breached' ELSE 'met' END,
               breached_at = CASE WHEN deadline_at < now() THEN now() ELSE NULL END,
               updated_at  = now()
           WHERE ticket_id = $1 AND status = 'active'`,
          [t.ticket_id],
        );

        await qr.commitTransaction();

        this.messaging.emit('ticket.state_changed', {
          ticketId:  t.ticket_id,
          title:     t.title,
          createdBy: t.created_by,
          toLabel:   'Cerrado automáticamente',
          actorId:   'system',
        });
      } catch (err: any) {
        await qr.rollbackTransaction();
        this.logger.error(`Auto-close ticket ${t.ticket_id}: ${err.message}`);
      } finally {
        await qr.release();
      }
    }
  }

  async triggerManual(): Promise<{ closed: number }> {
    const pending = await this.countPending();
    await this.closeExpiredResolved();
    return { closed: pending };
  }

  private async countPending(): Promise<number> {
    const [{ count }] = await this.db.query<{ count: string }[]>(`
      SELECT COUNT(*) AS count
      FROM   tickets.tickets  t
      JOIN   tickets.states   s  ON s.id = t.current_state_id AND s.is_approval_state = true
      JOIN   modules.modules  m  ON m.id = t.module_id
                                AND m.auto_close_hours > 0
      JOIN   LATERAL (
               SELECT transitioned_at
               FROM   tickets.ticket_state_history
               WHERE  ticket_id = t.id AND to_state_id = t.current_state_id
               ORDER  BY transitioned_at DESC LIMIT 1
             ) tsh ON true
      WHERE  t.deleted_at IS NULL
        AND  tsh.transitioned_at < now() - (m.auto_close_hours || ' hours')::interval
    `);
    return Number(count);
  }
}
