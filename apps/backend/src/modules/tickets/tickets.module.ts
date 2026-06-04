import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { MeetingsController } from './meetings.controller';
import { MeetingsService } from './meetings.service';
import { SlaService } from './sla/sla.service';
import { SlaEvaluatorService } from './sla/sla-evaluator.service';
import { SlaBreachService } from './sla/sla-breach.service';
import { AutoCloseService } from './sla/auto-close.service';
import { PriorityEngineService } from './priority/priority-engine.service';
import { AssignmentService } from './assignment/assignment.service';
import { RoundRobinStrategy } from './assignment/strategies/round-robin.strategy';
import { SkillBasedStrategy } from './assignment/strategies/skill-based.strategy';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([]), NotificationsModule],
  controllers: [TicketsController, MeetingsController],
  providers: [TicketsService, MeetingsService, SlaService, SlaEvaluatorService, SlaBreachService, AutoCloseService, PriorityEngineService, AssignmentService, RoundRobinStrategy, SkillBasedStrategy],
  exports: [TicketsService, MeetingsService, SlaService, SlaEvaluatorService, PriorityEngineService],
})
export class TicketsModule {}
