import { Injectable } from '@nestjs/common';
import { NotificationPayload } from '../notifications.service';

@Injectable()
export class WhatsappChannel {
  async send(_payload: NotificationPayload): Promise<void> {
    // WhatsApp API implementation goes here
  }
}
