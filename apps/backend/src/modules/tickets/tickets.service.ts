import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SlaService } from './sla/sla.service';
import { AssignmentService } from './assignment/assignment.service';

// future microservice: tickets-service
@Injectable()
export class TicketsService {
  constructor(
    private readonly sla: SlaService,
    private readonly assignment: AssignmentService,
    private readonly events: EventEmitter2,
  ) {}

  findAll() {
    return [];
  }

  findOne(_id: string) {
    return null;
  }

  create(_dto: Record<string, unknown>) {
    return null;
  }

  transition(_id: string, _event: string) {
    return null;
  }
}
