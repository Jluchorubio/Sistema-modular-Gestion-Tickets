import { Injectable } from '@nestjs/common';
import { RoundRobinStrategy } from './strategies/round-robin.strategy';
import { SkillBasedStrategy } from './strategies/skill-based.strategy';

@Injectable()
export class AssignmentService {
  constructor(
    private readonly roundRobin: RoundRobinStrategy,
    private readonly skillBased: SkillBasedStrategy,
  ) {}

  assign(_ticketId: string, _moduleId: string): string | null {
    // Strategy selection is driven by module configuration
    return null;
  }
}
