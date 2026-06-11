import { Injectable } from '@nestjs/common';
import { SlaEvaluatorService, SlaContext, SlaResult } from './sla-evaluator.service';

export type { SlaContext, SlaResult };

@Injectable()
export class SlaService {
  constructor(private readonly evaluator: SlaEvaluatorService) {}

  compute(ctx: SlaContext): Promise<SlaResult> {
    return this.evaluator.compute(ctx);
  }

  suggestPriority(damageTypeId: string): Promise<string | null> {
    return this.evaluator.suggestPriorityFromDamageType(damageTypeId);
  }
}
