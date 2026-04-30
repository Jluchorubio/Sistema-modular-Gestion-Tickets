import { Injectable } from '@nestjs/common';

// future microservice: reporting-service (Python) — read-only queries
@Injectable()
export class ReportingService {
  slaMetrics(_moduleId: string) {
    return {};
  }

  ticketsSummary(_moduleId: string) {
    return {};
  }
}
