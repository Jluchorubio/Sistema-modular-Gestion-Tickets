import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { MessagingService } from '../../../shared/messaging/messaging.service';

@Injectable()
export class ApprovalExpiryService {
  private readonly logger = new Logger(ApprovalExpiryService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly messaging: MessagingService,
  ) {}

  /** Every 5 min — expire pending approvals past their deadline and reopen tickets. */
  @Cron('*/5 * * * *', { name: 'approval-expiry' })
  async run(): Promise<void> {
    try {
      await this.expireApprovals();
    } catch (err: any) {
      this.logger.error(`Approval expiry cycle failed: ${err.message}`);
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

        await this.db.query(`SELECT set_config('app.current_user_id', 'system', true)`);

        const reopenCount    = (t.reprocess_count ?? 0) + 1;
        const shouldEscalate = reopenCount >= 3 && t.priority !== 'critica';
        const newPriority    = shouldEscalate ? 'alta' : t.priority;

        await this.db.query(
          `UPDATE tickets.tickets
           SET current_state_id = $1,
               reprocess_count  = $2,
               priority         = $3
           WHERE id = $4`,
          [trans.to_state_id, reopenCount, newPriority, t.ticket_id],
        );

        await this.db.query(
          `UPDATE tickets.ticket_approvals SET status = 'expired' WHERE ticket_id = $1 AND status = 'pending'`,
          [t.ticket_id],
        );

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
