import { Module } from '@nestjs/common';
import { SystemConfigController } from './system-config.controller';
import { SystemConfigService } from './system-config.service';
import { AuditLogService } from './audit-log.service';
import { PriorityEngineService } from '../tickets/priority/priority-engine.service';
import { MessagingModule } from '../../shared/messaging/messaging.module';

@Module({
  controllers: [SystemConfigController],
  providers:   [SystemConfigService, AuditLogService, PriorityEngineService],
  exports:     [SystemConfigService, AuditLogService],
})
export class SystemConfigModule {}
