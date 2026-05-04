import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { SlaService } from './sla/sla.service';
import { AssignmentService } from './assignment/assignment.service';
import { RoundRobinStrategy } from './assignment/strategies/round-robin.strategy';
import { SkillBasedStrategy } from './assignment/strategies/skill-based.strategy';

@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [TicketsController],
  providers: [TicketsService, SlaService, AssignmentService, RoundRobinStrategy, SkillBasedStrategy],
  exports: [TicketsService],
})
export class TicketsModule {}
