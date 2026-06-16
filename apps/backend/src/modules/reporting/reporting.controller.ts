import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { ReportingService } from './reporting.service';

@ApiTags('reporting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin', 'admin_modulo')
@Controller('reporting')
export class ReportingController {
  constructor(private readonly service: ReportingService) {}

  @Get('sla')
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
  @ApiOperation({ summary: 'Métricas de inventario: totales por estado y categoría.' })
  @ApiQuery({ name: 'moduleId', required: false })
  inventorySummary(@Query('moduleId') moduleId?: string) {
    return this.service.inventorySummary(moduleId);
  }

  @Get('audit/kpis')
  @ApiOperation({ summary: 'KPIs de auditoría: conteos por severidad para el día de hoy.' })
  auditKpis() {
    return this.service.auditKpis();
  }

  @Get('audit/activity')
  @ApiOperation({ summary: 'Actividad de usuarios en los últimos 30 días (top N actores).' })
  @ApiQuery({ name: 'limit', required: false })
  auditUserActivity(@Query('limit') limit?: string) {
    return this.service.auditUserActivity(limit ? parseInt(limit, 10) : 15);
  }

  @Get('audit')
  @ApiOperation({ summary: 'Log de auditoría con filtros opcionales.' })
  @ApiQuery({ name: 'limit',       required: false })
  @ApiQuery({ name: 'entity_type', required: false })
  @ApiQuery({ name: 'actor_id',    required: false })
  @ApiQuery({ name: 'action',      required: false })
  @ApiQuery({ name: 'dateFrom',    required: false })
  @ApiQuery({ name: 'dateTo',      required: false })
  auditLog(
    @Query('limit')       limit?:      string,
    @Query('entity_type') entityType?: string,
    @Query('actor_id')    actorId?:    string,
    @Query('action')      action?:     string,
    @Query('dateFrom')    dateFrom?:   string,
    @Query('dateTo')      dateTo?:     string,
  ) {
    return this.service.auditLogFiltered({
      limit:      limit ? Math.min(parseInt(limit, 10), 200) : 100,
      entityType,
      actorId,
      action,
      dateFrom,
      dateTo,
    });
  }

  @Get('helpdesk')
  @ApiOperation({ summary: 'Métricas específicas de Helpdesk: KPIs, técnicos, categorías, SLA.' })
  @ApiQuery({ name: 'moduleId', required: true })
  @ApiQuery({ name: 'dateFrom', required: false })
  @ApiQuery({ name: 'dateTo',   required: false })
  helpdeskMetrics(
    @Query('moduleId') moduleId: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo')   dateTo?:   string,
  ) {
    return this.service.helpdeskMetrics(moduleId, dateFrom, dateTo);
  }

  @Get('export/tickets')
  @ApiOperation({ summary: 'Exportar tickets a CSV (máx 5000 filas). Supera el límite → añade fila # TRUNCADO al final.' })
  @ApiQuery({ name: 'moduleId',  required: false })
  @ApiQuery({ name: 'dateFrom',  required: false, description: 'ISO date — filtro fecha creación desde' })
  @ApiQuery({ name: 'dateTo',    required: false, description: 'ISO date — filtro fecha creación hasta' })
  async exportTicketsCsv(
    @Query('moduleId') moduleId: string | undefined,
    @Query('dateFrom') dateFrom: string | undefined,
    @Query('dateTo')   dateTo:   string | undefined,
    @Res() res: Response,
  ) {
    const csv = await this.service.exportTicketsCsv(moduleId, dateFrom, dateTo);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="tickets-${Date.now()}.csv"`);
    res.send('﻿' + csv);
  }
}
