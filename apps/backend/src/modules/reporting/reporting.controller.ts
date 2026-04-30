import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('reporting')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('sla')
  slaMetrics(@Query('moduleId') moduleId: string) {
    return this.service.slaMetrics(moduleId);
  }

  @Get('tickets')
  ticketsSummary(@Query('moduleId') moduleId: string) {
    return this.service.ticketsSummary(moduleId);
  }
}
