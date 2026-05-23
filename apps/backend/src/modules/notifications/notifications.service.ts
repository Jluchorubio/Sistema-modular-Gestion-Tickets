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
  async onTicketCreated(ev: { ticketId: string; title: string; createdBy: string; moduleId: string }) {
    await this.notifyUser({
      userId:    ev.createdBy,
      eventType: 'ticket.created',
      subject:   `Ticket creado: ${ev.title}`,
      body:      `Tu ticket "${ev.title}" fue creado y está en cola de atención.`,
      channels:  ['in_app', 'email'],
      meta:      { ticketId: ev.ticketId },
    });
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
