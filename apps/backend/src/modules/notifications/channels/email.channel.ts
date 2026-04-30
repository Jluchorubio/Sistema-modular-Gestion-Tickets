import { Injectable } from '@nestjs/common';
import { NotificationPayload } from '../notifications.service';

@Injectable()
export class EmailChannel {
  async send(_payload: NotificationPayload): Promise<void> {
    // nodemailer implementation goes here
  }
}
