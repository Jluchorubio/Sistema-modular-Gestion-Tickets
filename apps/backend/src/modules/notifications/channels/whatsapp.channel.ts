import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import type { NotificationPayload } from '../notifications.service';

@Injectable()
export class WhatsappChannel {
  private readonly logger = new Logger(WhatsappChannel.name);

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async send(payload: NotificationPayload): Promise<void> {
    const token   = this.config.get<string>('WHATSAPP_TOKEN');
    const phoneId = this.config.get<string>('WHATSAPP_PHONE_ID');

    if (!token || !phoneId) {
      this.logger.warn('WhatsApp no configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID ausentes)');
      return;
    }

    const [profile] = await this.db.query<{ phone_prefix: string | null; phone: string | null }[]>(
      `SELECT phone_prefix, phone FROM users.profiles WHERE id = $1 LIMIT 1`,
      [payload.userId],
    );

    const rawPhone = profile?.phone?.replace(/\D/g, '');
    if (!rawPhone) return;

    const prefix = (profile.phone_prefix ?? '').replace(/\D/g, '');
    const to = prefix ? `+${prefix}${rawPhone}` : `+${rawPhone}`;

    const body = {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: `*${payload.subject}*\n\n${payload.body}` },
    };

    const res = await fetch(
      `https://graph.facebook.com/v19.0/${phoneId}/messages`,
      {
        method:  'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type':  'application/json',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => res.statusText);
      this.logger.error(`WhatsApp API error ${res.status}: ${err}`);
    } else {
      this.logger.log(`WhatsApp enviado a ${to}`);
    }
  }
}
