import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin_modulo', 'jefe_tecnico')
@Controller('reporting')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('sla')
  @ApiOperation({ summary: 'Métricas de SLA: cumplimiento global y por prioridad.' })
  @ApiQuery({ name: 'moduleId', required: false })
  slaMetrics(@Query('moduleId') moduleId?: string) {
    return this.service.slaMetrics(moduleId);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'Resumen de tickets: totales, por estado, prioridad y tendencia 30 días.' })
  @ApiQuery({ name: 'moduleId', required: false })
  ticketsSummary(@Query('moduleId') moduleId?: string) {
    return this.service.ticketsSummary(moduleId);
  }
}
