import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MessagingService } from '../../../shared/messaging/messaging.service';
import { NotificationsService } from '../../notifications/notifications.service';

@Injectable()
export class ApprovalExpiryService {
  private readonly logger = new Logger(ApprovalExpiryService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly messaging: MessagingService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every 5 min — send 24h-before-expiry reminders, then expire past-deadline approvals. */
  @Cron('*/5 * * * *', { name: 'approval-expiry' })
  async run(): Promise<void> {
    try {
      await this.sendApprovalReminders();
      await this.expireApprovals();
    } catch (err: any) {
      this.logger.error(`Approval expiry cycle failed: ${err.message}`);
    }
  }

  private async sendApprovalReminders(): Promise<void> {
    const pending = await this.db.query<{
      approval_id: string;
      ticket_id:   string;
      title:       string;
      created_by:  string;
      expires_at:  string;
    }[]>(`
      SELECT ap.id AS approval_id,
             t.id  AS ticket_id,
             t.title,
             t.created_by,
             ap.expires_at
      FROM   tickets.ticket_approvals ap
      JOIN   tickets.tickets t ON t.id = ap.ticket_id
      JOIN   tickets.states  s ON s.id = t.current_state_id AND s.is_approval_state = true
      WHERE  ap.status           = 'pending'
        AND  ap.reminder_sent_at IS NULL
        AND  ap.expires_at BETWEEN now() AND now() + INTERVAL '24 hours'
        AND  t.deleted_at IS NULL
      LIMIT  100
    `);

    if (!pending.length) return;
    this.logger.log(`Sending ${pending.length} approval reminder(s)`);

    for (const ap of pending) {
      try {
        const diff = new Date(ap.expires_at).getTime() - Date.now();
        const h    = Math.max(1, Math.round(diff / 3600000));

        await this.notifications.notifyUser({
          userId:    ap.created_by,
          eventType: 'ticket.approval_expiring_soon',
          subject:   `Recuerda validar: ${ap.title}`,
          body:      `Tu ticket "${ap.title}" está marcado como resuelto y espera tu confirmación. Tienes aproximadamente ${h} hora${h !== 1 ? 's' : ''} para aprobar o rechazar la solución antes de que se cierre automáticamente.`,
          channels:  ['in_app', 'email'],
          meta:      { ticketId: ap.ticket_id },
        });

        await this.db.query(
          `UPDATE tickets.ticket_approvals SET reminder_sent_at = now() WHERE id = $1`,
          [ap.approval_id],
        );
      } catch (err: any) {
        this.logger.error(`Approval reminder ${ap.approval_id}: ${err.message}`);
      }
    }
  }

  private async expireApprovals(): Promise<void> {
    const expired = await this.db.query<{
      ticket_id:            string;
      title:                string;
      created_by:           string;
      module_id:            string;
      workflow_version_id:  string;
      current_state_id:     string;
      reprocess_count:      number;
      priority:             string;
    }[]>(`
      SELECT t.id                  AS ticket_id,
             t.title,
             t.created_by,
             t.module_id,
             t.workflow_version_id,
             t.current_state_id,
             t.reprocess_count,
             t.priority
      FROM   tickets.ticket_approvals ap
      JOIN   tickets.tickets t ON t.id = ap.ticket_id
      JOIN   tickets.states  s ON s.id = t.current_state_id AND s.is_approval_state = true
      WHERE  ap.status = 'pending'
        AND  ap.expires_at < now()
        AND  t.deleted_at IS NULL
      LIMIT  100
    `);

    if (!expired.length) return;
    this.logger.log(`Expiring ${expired.length} approval(s) past deadline`);

    for (const t of expired) {
      try {
        const [trans] = await this.db.query<{ to_state_id: string }[]>(
          `SELECT tr.to_state_id
           FROM   tickets.transitions tr
           JOIN   tickets.states ts2 ON ts2.id = tr.to_state_id
           WHERE  tr.workflow_version_id = $1
             AND  tr.from_state_id       = $2
             AND  ts2.is_final           = false
             AND  ts2.is_pause_state     = false
             AND  ts2.is_approval_state  = false
             AND  tr.is_active           = true
           LIMIT 1`,
          [t.workflow_version_id, t.current_state_id],
        );

        if (!trans) {
          this.logger.warn(`Ticket ${t.ticket_id}: no back-transition from approval state — skipping`);
          continue;
        }

        const reopenCount    = (t.reprocess_count ?? 0) + 1;
        const shouldEscalate = reopenCount >= 3 && t.priority !== 'critica';
        const newPriority    = shouldEscalate ? 'alta' : t.priority;

        // Fetch approval wait duration BEFORE transaction (read-only)
        const [approval] = await this.db.query<{ created_at: string }[]>(
          `SELECT created_at FROM tickets.ticket_approvals
           WHERE ticket_id = $1 AND status = 'pending' LIMIT 1`,
          [t.ticket_id],
        );
        const waitSecs = approval
          ? Math.ceil((Date.now() - new Date(approval.created_at).getTime()) / 1000)
          : 0;

        // Atomic transaction: ticket state + approval status + SLA extension
        const qr = this.db.createQueryRunner();
        await qr.connect();
        await qr.startTransaction();
        try {
          await qr.query(`SELECT set_config('app.current_user_id', 'system', true)`);

          await qr.query(
            `UPDATE tickets.tickets
             SET current_state_id = $1,
                 reprocess_count  = $2,
                 priority         = $3
             WHERE id = $4`,
            [trans.to_state_id, reopenCount, newPriority, t.ticket_id],
          );

          await qr.query(
            `UPDATE tickets.ticket_approvals
             SET status = 'expired'
             WHERE ticket_id = $1 AND status = 'pending'`,
            [t.ticket_id],
          );

          // Extend SLA by time spent in approval; reactivate tracking
          if (waitSecs > 0) {
            await qr.query(
              `UPDATE tickets.ticket_sla_tracking
               SET deadline_at = deadline_at + ($1 || ' seconds')::interval,
                   status      = 'active'
               WHERE ticket_id = $2 AND status IN ('active', 'breached')`,
              [waitSecs, t.ticket_id],
            );
          }

          await qr.commitTransaction();
        } catch (txErr) {
          await qr.rollbackTransaction();
          throw txErr;
        } finally {
          await qr.release();
        }

        this.messaging.emit('ticket.state_changed', {
          ticketId:  t.ticket_id,
          title:     t.title,
          createdBy: t.created_by,
          toLabel:   'Aprobación expirada — reabierto',
          actorId:   'system',
        });

        this.messaging.emit('ticket.approval_expired', {
          ticketId:      t.ticket_id,
          title:         t.title,
          createdBy:     t.created_by,
          reopenCount,
        });

        if (shouldEscalate) {
          this.messaging.emit('ticket.escalated', {
            ticketId:  t.ticket_id,
            title:     t.title,
            moduleId:  t.module_id,
            reason:    `Auto-escalado por ${reopenCount} reaperturas de aprobación`,
          });
        }

        this.logger.log(`Ticket ${t.ticket_id} reopened after approval expiry (reopen #${reopenCount})`);
      } catch (err: any) {
        this.logger.error(`Approval expiry ticket ${t.ticket_id}: ${err.message}`);
      }
    }
  }
}
