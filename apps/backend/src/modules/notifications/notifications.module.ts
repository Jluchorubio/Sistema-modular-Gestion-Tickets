import { Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { EmailChannel } from './channels/email.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, EmailChannel, WhatsappChannel],
  exports: [NotificationsService],
})
export class NotificationsModule {}
