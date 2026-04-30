import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';

// future microservice: reporting-service (Python, read-only)
@Module({
  controllers: [ReportingController],
  providers: [ReportingService],
})
export class ReportingModule {}
