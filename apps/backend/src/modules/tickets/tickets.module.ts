import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TicketsController } from './tickets.controller';
import { TicketsService } from './tickets.service';
import { SlaService } from './sla/sla.service';
import { AssignmentService } from './assignment/assignment.service';

// future microservice: tickets-service
@Module({
  imports: [TypeOrmModule.forFeature([])],
  controllers: [TicketsController],
  providers: [TicketsService, SlaService, AssignmentService],
  exports: [TicketsService],
})
export class TicketsModule {}
