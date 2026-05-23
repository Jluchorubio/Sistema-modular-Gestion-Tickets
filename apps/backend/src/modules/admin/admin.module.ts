import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { CleanupService } from './cleanup.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports:     [NotificationsModule],
  controllers: [AdminController],
  providers:   [AdminService, CleanupService],
})
export class AdminModule {}
