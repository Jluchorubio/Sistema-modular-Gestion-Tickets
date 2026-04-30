import { Injectable } from '@nestjs/common';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

@Injectable()
export class SlaService {
  calculatePriority(_context: Record<string, unknown>): Priority {
    // Rules are loaded dynamically from system-modules config
    return 'medium';
  }

  calculateDeadline(_priority: Priority, _createdAt: Date): Date {
    return new Date();
  }
}
