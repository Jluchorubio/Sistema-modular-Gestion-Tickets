import { Module } from '@nestjs/common';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';
import { AuditLogService } from './audit-log.service';
import { MessagingModule } from '../../shared/messaging/messaging.module';

@Module({
  imports:     [MessagingModule],
  controllers: [SystemConfigController],
  providers:   [SystemConfigService, AuditLogService],
  exports:     [SystemConfigService, AuditLogService],
})
export class SystemConfigModule {}
