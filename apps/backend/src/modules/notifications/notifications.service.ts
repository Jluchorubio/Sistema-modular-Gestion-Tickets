import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { EmailChannel } from './channels/email.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';

export interface NotificationPayload {
  userId: string;
  subject: string;
  body: string;
  channels: ('email' | 'whatsapp' | 'internal')[];
}

@Injectable()
export class NotificationsService {
  constructor(
    private readonly email: EmailChannel,
    private readonly whatsapp: WhatsappChannel,
  ) {}

  @OnEvent('ticket.validation_required')
  async handleValidationRequired(payload: NotificationPayload) {
    await this.send(payload);
  }

  async send(payload: NotificationPayload) {
    if (payload.channels.includes('email')) {
      await this.email.send(payload);
    }
    if (payload.channels.includes('whatsapp')) {
      await this.whatsapp.send(payload);
    }
  }
}
