import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsConsumerController } from './notifications.consumer.controller';
import { EmailChannel } from './channels/email.channel';
import { WhatsappChannel } from './channels/whatsapp.channel';
import { NotificationsGateway } from '../../gateway/notifications.gateway';
import { MessagingModule } from '../../shared/messaging/messaging.module';

@Module({
  imports: [
    MessagingModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
  ],
  controllers: [NotificationsController, NotificationsConsumerController],
  providers: [NotificationsService, EmailChannel, WhatsappChannel, NotificationsGateway],
  exports: [NotificationsService],
})
export class NotificationsModule {}
