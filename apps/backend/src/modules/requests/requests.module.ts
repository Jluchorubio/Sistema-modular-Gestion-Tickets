import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { RequestsScheduler } from './requests.scheduler';
import { SystemConfigModule } from '../system-config/system-config.module';
import { TicketsModule } from '../tickets/tickets.module';
import { MessagingModule } from '../../shared/messaging/messaging.module';

@Module({
  imports: [MessagingModule, TypeOrmModule.forFeature([]), SystemConfigModule, TicketsModule],
  controllers: [RequestsController],
  providers: [RequestsService, RequestsScheduler],
  exports: [RequestsService],
})
export class RequestsModule {}
