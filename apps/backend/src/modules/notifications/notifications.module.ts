import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { EmailChannel } from './channels/email.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';

// future microservice: notifications-service (consumes Redis events)
@Module({
  providers: [NotificationsService, EmailChannel, WhatsappChannel],
  exports: [NotificationsService],
})
export class NotificationsModule {}
