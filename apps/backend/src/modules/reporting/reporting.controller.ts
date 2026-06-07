import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin_modulo', 'jefe_tecnico')
@Controller('reporting')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('sla')
  @RequirePermission('global:reports:view')
  @ApiOperation({ summary: 'Métricas de SLA: cumplimiento global y por prioridad.' })
  @ApiQuery({ name: 'moduleId',  required: false })
  @ApiQuery({ name: 'dateFrom',  required: false })
  @ApiQuery({ name: 'dateTo',    required: false })
  slaMetrics(
    @Query('moduleId') moduleId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo')   dateTo?:   string,
  ) {
    return this.service.slaMetrics(moduleId, dateFrom, dateTo);
  }

  @Get('tickets')
  @RequirePermission('global:reports:view')
  @ApiOperation({ summary: 'Resumen de tickets: totales, por estado, prioridad y tendencia 30 días.' })
  @ApiQuery({ name: 'moduleId',  required: false })
  @ApiQuery({ name: 'dateFrom',  required: false })
  @ApiQuery({ name: 'dateTo',    required: false })
  ticketsSummary(
    @Query('moduleId') moduleId?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo')   dateTo?:   string,
  ) {
    return this.service.ticketsSummary(moduleId, dateFrom, dateTo);
  }

  @Get('inventory')
  @RequirePermission('global:reports:view')
  @ApiOperation({ summary: 'Métricas de inventario: totales por estado y categoría.' })
  @ApiQuery({ name: 'moduleId', required: false })
  inventorySummary(@Query('moduleId') moduleId?: string) {
    return this.service.inventorySummary(moduleId);
  }

  @Get('audit')
  @RequirePermission('global:reports:view')
  @ApiOperation({ summary: 'Log de auditoría: últimas N entradas del event_log.' })
  @ApiQuery({ name: 'limit',       required: false })
  @ApiQuery({ name: 'entity_type', required: false })
  auditLog(
    @Query('limit')       limit?: string,
    @Query('entity_type') entityType?: string,
  ) {
    return this.service.auditLog(limit ? Math.min(parseInt(limit, 10), 200) : 50, entityType);
  }

  @Get('helpdesk')
  @RequirePermission('helpdesk:reports:view')
  @ApiOperation({ summary: 'Métricas específicas de Helpdesk: KPIs, técnicos, categorías, SLA.' })
  @ApiQuery({ name: 'moduleId', required: true })
  helpdeskMetrics(@Query('moduleId') moduleId: string) {
    return this.service.helpdeskMetrics(moduleId);
  }

  @Get('export/tickets')
  @RequirePermission('global:reports:view')
  @ApiOperation({ summary: 'Exportar tickets a CSV (máx 5000 filas).' })
  @ApiQuery({ name: 'moduleId', required: false })
  async exportTicketsCsv(
    @Query('moduleId') moduleId: string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportTicketsCsv(moduleId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${Date.now()}.csv"`);
    res.send('﻿' + csv); // BOM for Excel UTF-8
  }
}
