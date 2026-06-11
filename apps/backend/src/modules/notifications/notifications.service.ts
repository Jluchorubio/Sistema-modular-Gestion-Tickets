import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailChannel } from './channels/email.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { NotificationsGateway } from '../../gateway/notifications.gateway';

export interface NotificationPayload {
  userId:    string;
  eventType: string;
  subject:   string;
  body:      string;
  channels:  ('email' | 'whatsapp' | 'in_app')[];
  meta?:     Record<string, unknown>;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly email: EmailChannel,
    private readonly whatsapp: WhatsappChannel,
    private readonly gateway: NotificationsGateway,
  ) {}

  async notifyUser(payload: NotificationPayload): Promise<void> {
    const { userId, eventType, subject, body, channels, meta } = payload;

    if (channels.includes('in_app')) {
      try {
        await this.db.query(
          `INSERT INTO notifications.notification_logs (user_id, channel, event_type, status, payload)
           VALUES ($1, 'in_app', $2, 'pending', $3)`,
          [userId, eventType, JSON.stringify({ subject, body, ...meta })],
        );
        // Push real-time to connected client
        this.gateway.sendToUser(userId, 'notification', { eventType, subject, body, ...meta });
      } catch (err) {
        this.logger.error(`in_app log error: ${err.message}`);
      }
    }

    if (channels.includes('email')) {
      try { await this.email.send(payload); }
      catch (err) { this.logger.error(`email send error: ${err.message}`); }
    }

    if (channels.includes('whatsapp')) {
      try { await this.whatsapp.send(payload); }
      catch (err) { this.logger.error(`whatsapp send error: ${err.message}`); }
    }
  }

  /* ── Event handlers ──────────────────────────────────────────────────────── */

  @OnEvent('ticket.created')
  async onTicketCreated(ev: {
    ticketId:     string;
    title:        string;
    createdBy:    string;
    moduleId:     string;
    autoEscalated?: boolean;
    assignedTo?:    string;
  }) {
    await this.notifyUser({
      userId:    ev.createdBy,
      eventType: 'ticket.created',
      subject:   `Ticket creado: ${ev.title}`,
      body:      `Tu ticket "${ev.title}" fue creado y está en cola de atención.`,
      channels:  ['in_app', 'email'],
      meta:      { ticketId: ev.ticketId },
    });

    if (ev.autoEscalated) {
      const chiefs = await this.db.query<{ user_id: string }[]>(
        `SELECT umr.user_id
         FROM   modules.user_module_roles umr
         JOIN   modules.module_roles      mr  ON mr.id = umr.role_id
         WHERE  umr.module_id = $1
           AND  mr.name       = 'jefe_tecnico'
           AND  umr.is_active = true`,
        [ev.moduleId],
      );
      for (const { user_id } of chiefs) {
        await this.notifyUser({
          userId:    user_id,
          eventType: 'ticket.escalated',
          subject:   `Ticket auto-escalado: ${ev.title}`,
          body:      `El ticket "${ev.title}" fue escalado automáticamente por reincidencia. Requiere atención prioritaria.`,
          channels:  ['in_app', 'email'],
          meta:      { ticketId: ev.ticketId, moduleId: ev.moduleId },
        });
      }
    }
  }

  @OnEvent('ticket.assigned')
  async onTicketAssigned(ev: { ticketId: string; title: string; assigneeId: string }) {
    await this.notifyUser({
      userId:    ev.assigneeId,
      eventType: 'ticket.assigned',
      subject:   `Ticket asignado: ${ev.title}`,
      body:      `Se te ha asignado el ticket "${ev.title}". Por favor revísalo.`,
      channels:  ['in_app', 'email'],
      meta:      { ticketId: ev.ticketId },
    });
  }

  @OnEvent('request.approved')
  async onRequestApproved(ev: { requestId: string; title: string; requesterId: string; notes?: string }) {
    await this.notifyUser({
      userId:    ev.requesterId,
      eventType: 'request.approved',
      subject:   `Solicitud aprobada: ${ev.title}`,
      body:      `Tu solicitud "${ev.title}" fue aprobada.${ev.notes ? ` Notas: ${ev.notes}` : ''}`,
      channels:  ['in_app', 'email'],
      meta:      { requestId: ev.requestId },
    });
  }

  @OnEvent('request.rejected')
  async onRequestRejected(ev: { requestId: string; title: string; requesterId: string; notes?: string }) {
    await this.notifyUser({
      userId:    ev.requesterId,
      eventType: 'request.rejected',
      subject:   `Solicitud rechazada: ${ev.title}`,
      body:      `Tu solicitud "${ev.title}" fue rechazada.${ev.notes ? ` Motivo: ${ev.notes}` : ''}`,
      channels:  ['in_app', 'email'],
      meta:      { requestId: ev.requestId },
    });
  }

  @OnEvent('request.taken')
  async onRequestTaken(ev: { requestId: string; title: string; requesterId: string }) {
    await this.notifyUser({
      userId:    ev.requesterId,
      eventType: 'request.taken',
      subject:   `Solicitud en proceso: ${ev.title}`,
      body:      `Tu solicitud "${ev.title}" ha sido tomada y está siendo procesada.`,
      channels:  ['in_app'],
      meta:      { requestId: ev.requestId },
    });
  }

  @OnEvent('ticket.validation_required')
  async onTicketValidationRequired(ev: { ticketId: string; title: string; createdBy: string }) {
    await this.notifyUser({
      userId:    ev.createdBy,
      eventType: 'ticket.validation_required',
      subject:   `Ticket resuelto: ${ev.title}`,
      body:      `El equipo técnico ha resuelto tu ticket "${ev.title}". Revisa y valida la solución.`,
      channels:  ['in_app', 'email'],
      meta:      { ticketId: ev.ticketId },
    });
  }

  @OnEvent('ticket.state_changed')
  async onTicketStateChanged(ev: { ticketId: string; title: string; createdBy: string; toLabel: string; actorId: string }) {
    if (ev.createdBy === ev.actorId) return; // don't notify creator when they move their own ticket
    await this.notifyUser({
      userId:    ev.createdBy,
      eventType: 'ticket.state_changed',
      subject:   `Actualización: ${ev.title}`,
      body:      `Tu ticket "${ev.title}" cambió a estado "${ev.toLabel}".`,
      channels:  ['in_app'],
      meta:      { ticketId: ev.ticketId },
    });
  }

  @OnEvent('ticket.comment_added')
  async onCommentAdded(ev: {
    ticketId:   string;
    title:      string;
    createdBy:  string;
    authorName: string;
    actorId:    string;
  }) {
    if (ev.actorId === ev.createdBy) return;
    await this.notifyUser({
      userId:    ev.createdBy,
      eventType: 'ticket.comment_added',
      subject:   `Respuesta en tu ticket: ${ev.title}`,
      body:      `${ev.authorName} respondió a tu ticket "${ev.title}". Revisa la actualización.`,
      channels:  ['in_app'],
      meta:      { ticketId: ev.ticketId },
    });
  }

  @OnEvent('ticket.approval_expired')
  async onApprovalExpired(ev: { ticketId: string; title: string; createdBy: string; reopenCount: number }) {
    await this.notifyUser({
      userId:    ev.createdBy,
      eventType: 'ticket.approval_expired',
      subject:   `Aprobación expirada: ${ev.title}`,
      body:      `Tu aprobación para el ticket "${ev.title}" expiró sin respuesta y el ticket fue reabierto (reapertura #${ev.reopenCount}).`,
      channels:  ['in_app', 'email'],
      meta:      { ticketId: ev.ticketId },
    });
  }

  @OnEvent('ticket.escalated')
  async onTicketEscalated(ev: { ticketId: string; title: string; moduleId: string; reason?: string }) {
    if (!ev.moduleId) return;
    const chiefs = await this.db.query<{ user_id: string }[]>(
      `SELECT umr.user_id
       FROM   modules.user_module_roles umr
       JOIN   modules.module_roles      mr  ON mr.id = umr.role_id
       WHERE  umr.module_id = $1
         AND  mr.name       = 'jefe_tecnico'
         AND  umr.is_active = true`,
      [ev.moduleId],
    );
    for (const { user_id } of chiefs) {
      await this.notifyUser({
        userId:    user_id,
        eventType: 'ticket.escalated',
        subject:   `Ticket escalado: ${ev.title}`,
        body:      `El ticket "${ev.title}" fue escalado. ${ev.reason ?? 'Requiere atención prioritaria.'}`,
        channels:  ['in_app', 'email'],
        meta:      { ticketId: ev.ticketId, moduleId: ev.moduleId },
      });
    }
  }

  @OnEvent('meeting.scheduled')
  async onMeetingScheduled(ev: {
    meetingId:      string;
    ticketId:       string;
    ticketTitle:    string;
    scheduledAt:    string;
    participantIds: string[];
  }) {
    const date = new Date(ev.scheduledAt).toLocaleString('es-CO', {
      timeZone: 'America/Bogota',
      weekday: 'long', day: 'numeric', month: 'long',
      hour: '2-digit', minute: '2-digit',
    });
    for (const userId of ev.participantIds) {
      await this.notifyUser({
        userId,
        eventType: 'meeting.scheduled',
        subject:   `Reunión programada: ${ev.ticketTitle}`,
        body:      `Se ha programado una reunión para el ticket "${ev.ticketTitle}" el ${date}.`,
        channels:  ['in_app', 'email'],
        meta:      { meetingId: ev.meetingId, ticketId: ev.ticketId },
      });
    }
  }
}
