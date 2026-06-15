import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../../notifications/notifications.service';
import { PriorityEngineService } from '../priority/priority-engine.service';

/**
 * Handles tickets stuck in a pause state (is_pause_state = TRUE) beyond the
 * module's waiting_timeout_hours threshold.
 *
 * Two-phase response (runs daily at 09:00):
 *   Phase 1 — hours_stuck ∈ [1×, 2×) timeout: notify tech + jefe_tecnico
 *   Phase 2 — hours_stuck ≥ 2× timeout: escalate priority one level + notify
 */
@Injectable()
export class WaitingTimeoutService {
  private readonly logger = new Logger(WaitingTimeoutService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly notifications: NotificationsService,
    private readonly priorityEngine: PriorityEngineService,
  ) {}

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
      ticket_id:   string;
      title:       string;
      module_id:   string;
      created_by:  string;
      priority:    string;
      owner_id:    string | null;
      paused_at:   string;
      timeout_h:   number;
      hours_stuck: number;
    }[]>(`
      SELECT t.id                                          AS ticket_id,
             t.title,
             t.module_id,
             t.created_by,
             t.priority,
             ta.user_id                                   AS owner_id,
             tsh.transitioned_at                          AS paused_at,
             COALESCE(m.waiting_timeout_hours, 72)        AS timeout_h,
             EXTRACT(EPOCH FROM (now() - tsh.transitioned_at)) / 3600 AS hours_stuck
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
    `);

    if (!stuck.length) return;
    this.logger.log(`Waiting timeout: ${stuck.length} ticket(s) past pause threshold`);

    for (const t of stuck) {
      try {
        const shouldEscalate = t.hours_stuck >= t.timeout_h * 2;
        if (shouldEscalate) {
          await this.escalateTicket(t);
        } else {
          await this.notifyStuckTicket(t, false);
        }
      } catch (err: any) {
        this.logger.error(`Waiting timeout ticket ${t.ticket_id}: ${err.message}`);
      }
    }
  }

  private async escalateTicket(t: {
    ticket_id: string; title: string; module_id: string;
    created_by: string; owner_id: string | null;
    priority: string; timeout_h: number;
  }): Promise<void> {
    const newPriority = this.priorityEngine.escalatePriority(t.priority);
    const escalated   = newPriority !== t.priority;

    if (escalated) {
      await this.db.query(
        `UPDATE tickets.tickets SET priority = $1, updated_at = now() WHERE id = $2`,
        [newPriority, t.ticket_id],
      );
      this.logger.log(`Escalated ticket ${t.ticket_id}: ${t.priority} → ${newPriority}`);
    }

    await this.notifyStuckTicket(t, true, escalated ? newPriority : null);
  }

  private async notifyStuckTicket(
    t: { ticket_id: string; title: string; module_id: string; created_by: string; owner_id: string | null; timeout_h: number },
    isEscalation: boolean,
    newPriority?: string | null,
  ): Promise<void> {
    const timeoutDays = Math.round(t.timeout_h / 24);
    const subject = isEscalation
      ? `⚠️ Ticket escalado por inactividad: ${t.title}`
      : `Ticket en espera: ${t.title}`;
    const body = isEscalation
      ? `El ticket "${t.title}" lleva más de ${timeoutDays * 2} día(s) sin respuesta del solicitante. Su prioridad ha sido ${newPriority ? `elevada a "${newPriority}"` : 'revisada'}. Cierre o retome el ticket.`
      : `El ticket "${t.title}" lleva más de ${timeoutDays} día(s) en estado "En espera" sin actividad. Si no hay respuesta en ${timeoutDays} día(s) adicionales, la prioridad se elevará automáticamente.`;

    const meta = { ticketId: t.ticket_id, moduleId: t.module_id, isEscalation };

    if (t.owner_id) {
      await this.notifications.notifyUser({
        userId: t.owner_id, eventType: 'ticket.waiting_timeout',
        subject, body, channels: ['in_app'], meta,
      });
    }

    const chiefs = await this.db.query<{ user_id: string }[]>(
      `SELECT umr.user_id
       FROM   modules.user_module_roles umr
       JOIN   modules.module_roles      mr ON mr.id = umr.role_id
       WHERE  umr.module_id = $1 AND mr.name = 'jefe_tecnico' AND umr.is_active = true`,
      [t.module_id],
    );

    for (const { user_id } of chiefs) {
      if (user_id === t.owner_id) continue;
      await this.notifications.notifyUser({
        userId: user_id, eventType: 'ticket.waiting_timeout',
        subject, body, channels: ['in_app'], meta,
      });
    }
  }
}
