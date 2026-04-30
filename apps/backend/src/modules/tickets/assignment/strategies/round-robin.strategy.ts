import { Injectable } from '@nestjs/common';

@Injectable()
export class RoundRobinStrategy {
  nextTechnician(_moduleId: string, _availableTechnicianIds: string[]): string | null {
    return null;
  }
}
