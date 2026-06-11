import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class RequestsScheduler {
  private readonly logger = new Logger(RequestsScheduler.name);

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  /** Every 30 min: escalate requests whose SLA deadline has passed and are still active */
  @Cron(CronExpression.EVERY_30_MINUTES)
  async autoEscalateSlaBreach() {
    const overdue = await this.db.query<{ id: string; status: string }[]>(
      `SELECT id, status
       FROM requests.admin_requests
       WHERE deleted_at   IS NULL
         AND escalated     = FALSE
         AND status NOT IN ('approved', 'rejected', 'cancelled', 'completed')
         AND sla_due_at   IS NOT NULL
         AND sla_due_at    < now()`,
    );

    if (overdue.length === 0) return;

    for (const req of overdue) {
      await this.db.query(
        `UPDATE requests.admin_requests
         SET escalated       = TRUE,
             escalated_at    = now(),
             escalated_by    = NULL,
             escalation_note = 'Escalado automáticamente por vencimiento de SLA',
             updated_at      = now()
         WHERE id = $1`,
        [req.id],
      );
      // actor_id is NOT NULL — system actions have no human actor.
      // Timeline insert is informational; skip gracefully if constraint blocks it.
      try {
        await this.db.query(
          `INSERT INTO requests.request_timeline
             (request_id, actor_id, action, old_status, new_status, notes)
           SELECT $1, id, 'system_escalated', $2, $2,
                  'Escalado automáticamente por vencimiento de SLA'
           FROM users.profiles
           WHERE is_superadmin = true
           LIMIT 1`,
          [req.id, req.status],
        );
      } catch (err: any) {
        this.logger.warn(`Timeline insert skipped for ${req.id}: ${err.message}`);
      }
    }

    this.logger.log(`Auto-escalated ${overdue.length} SLA-breached request(s)`);
  }
}
