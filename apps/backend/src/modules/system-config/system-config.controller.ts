import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { SystemConfigService } from './system-config.service';
import {
  CreateHeadquarterDto, UpdateHeadquarterDto,
  CreateDepartmentDto, CreateAreaDto, CreatePositionDto,
} from './dto/org.dto';
import {
  UpdateSlaRuleDto, UpdateCompanyDto, UpdateRequestTypeDto,
  UpdateDamageTypeDto, UpsertBusinessHourDto, CreateHolidayDto,
  CreateTicketSlaRuleDto, UpdateTicketSlaRuleDto, CreateTicketSlaConditionDto,
} from './dto/config.dto';
import { BulkImportUsersDto } from './dto/bulk-import.dto';

@ApiTags('system-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('system-config')
export class SystemConfigController {
  constructor(private readonly svc: SystemConfigService) {}

  /* ── Public endpoints (all authenticated users) ── */

  @Get('company/public')
  @ApiOperation({ summary: 'Datos públicos de empresa (nombre, logo, color). Todos los usuarios.' })
  getPublicCompanyInfo() { return this.svc.getPublicCompanyInfo(); }

  @Get('request-types')
  @ApiOperation({ summary: 'Tipos de solicitud. Filtro ?active=true para solo activos.' })
  getRequestTypes(@Query('active') active?: string) {
    return this.svc.getRequestTypes(active === 'true');
  }

  @Get('headquarters')
  @ApiOperation({ summary: 'Sedes activas. Todos los usuarios autenticados.' })
  getHeadquarters() { return this.svc.getHeadquarters(); }

  @Get('departments')
  @ApiOperation({ summary: 'Departamentos activos.' })
  getDepartments() { return this.svc.getDepartments(); }

  @Get('areas')
  @ApiOperation({ summary: 'Áreas activas. Filtro opcional por department_id.' })
  getAreas(@Query('department_id') departmentId?: string) {
    return this.svc.getAreas(departmentId);
  }

  @Get('positions')
  @ApiOperation({ summary: 'Cargos activos.' })
  getPositions() { return this.svc.getPositions(); }

  @Get('ticket-categories')
  @ApiOperation({ summary: 'Categorías de tickets (Hardware, Software, Red…). Todos los usuarios.' })
  getTicketCategories() { return this.svc.getTicketCategories(); }

  @Get('damage-types')
  @ApiOperation({ summary: 'Tipos de daño. Filtro ?category_id=uuid para una categoría.' })
  getDamageTypes(@Query('category_id') categoryId?: string) {
    return this.svc.getDamageTypes(categoryId);
  }

  /* ── Superadmin-only endpoints ── */

  @Post('initialize')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Marca el sistema como inicializado. Solo se llama una vez al finalizar el wizard de setup.' })
  initializeSystem() { return this.svc.initializeSystem(); }

  @Get('company')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  getCompany() { return this.svc.getCompany(); }

  @Patch('company')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:company')
  updateCompany(@Body() dto: UpdateCompanyDto) { return this.svc.updateCompany(dto); }

  @Get('org/summary')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  getOrgSummary() { return this.svc.getOrgSummary(); }

  @Post('headquarters')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  createHeadquarter(@Body() dto: CreateHeadquarterDto) { return this.svc.createHeadquarter(dto); }

  @Patch('headquarters/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  updateHeadquarter(@Param('id') id: string, @Body() dto: UpdateHeadquarterDto) {
    return this.svc.updateHeadquarter(id, dto);
  }

  @Delete('headquarters/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  deleteHeadquarter(@Param('id') id: string) { return this.svc.deleteHeadquarter(id); }

  @Post('departments')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  createDepartment(@Body() dto: CreateDepartmentDto) { return this.svc.createDepartment(dto); }

  @Delete('departments/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  deleteDepartment(@Param('id') id: string) { return this.svc.deleteDepartment(id); }

  @Post('areas')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  createArea(@Body() dto: CreateAreaDto) { return this.svc.createArea(dto); }

  @Delete('areas/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  deleteArea(@Param('id') id: string) { return this.svc.deleteArea(id); }

  @Post('positions')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  createPosition(@Body() dto: CreatePositionDto) { return this.svc.createPosition(dto); }

  @Delete('positions/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  deletePosition(@Param('id') id: string) { return this.svc.deletePosition(id); }

  @Get('sla-rules')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  getSlaRules() { return this.svc.getSlaRules(); }

  @Patch('sla-rules/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  updateSlaRule(@Param('id') id: string, @Body() dto: UpdateSlaRuleDto) {
    return this.svc.updateSlaRule(id, dto);
  }

  @Get('priority-rules')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  getPriorityRules() { return this.svc.getPriorityRules(); }

  @Patch('damage-types/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Editar tipo de daño (is_active, weight, label)' })
  updateDamageType(@Param('id') id: string, @Body() dto: UpdateDamageTypeDto) {
    return this.svc.updateDamageType(id, dto);
  }

  @Get('business-hours')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Horarios laborales. ?module_id=uuid para módulo específico, sin param = global.' })
  getBusinessHours(@Query('module_id') moduleId?: string) {
    return this.svc.getBusinessHours(moduleId);
  }

  @Post('business-hours')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Crear o actualizar horario laboral para un día (upsert por module_id + day_of_week).' })
  upsertBusinessHour(@Body() dto: UpsertBusinessHourDto) {
    return this.svc.upsertBusinessHour(dto);
  }

  @Get('holidays')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Feriados. ?module_id=uuid incluye globales + los del módulo.' })
  getHolidays(@Query('module_id') moduleId?: string) {
    return this.svc.getHolidays(moduleId);
  }

  @Post('holidays')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Agregar feriado (upsert por module_id + date).' })
  createHoliday(@Body() dto: CreateHolidayDto) {
    return this.svc.createHoliday(dto);
  }

  @Delete('holidays/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Desactivar feriado.' })
  deleteHoliday(@Param('id') id: string) {
    return this.svc.deleteHoliday(id);
  }

  @Patch('request-types/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:request_types')
  @ApiOperation({ summary: 'Editar tipo de solicitud (label, descripción, is_active, sort_order)' })
  updateRequestType(@Param('id') id: string, @Body() dto: UpdateRequestTypeDto) {
    return this.svc.updateRequestType(id, dto);
  }

  @Post('users/bulk-import')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:bulk_import')
  @ApiOperation({ summary: 'Importar usuarios en lote (JSON de CSV/Excel parseado)' })
  bulkImport(@Body() dto: BulkImportUsersDto) { return this.svc.bulkImportUsers(dto); }

  /* ── Ticket SLA Policies (per-module) ──────────────────────────── */

  @Get('ticket-sla-policies')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Políticas SLA de tickets por módulo. ?module_id=uuid requerido.' })
  getTicketSlaPolicies(@Query('module_id') moduleId: string) {
    return this.svc.getTicketSlaPolicies(moduleId);
  }

  @Post('ticket-sla-policies/:policyId/rules')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Agregar regla SLA a una política.' })
  createTicketSlaRule(
    @Param('policyId') policyId: string,
    @Body() dto: CreateTicketSlaRuleDto,
  ) {
    return this.svc.createTicketSlaRule(policyId, dto);
  }

  @Patch('ticket-sla-policies/rules/:ruleId')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Actualizar regla SLA (nombre, horas, prioridad, is_active).' })
  updateTicketSlaRule(
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateTicketSlaRuleDto,
  ) {
    return this.svc.updateTicketSlaRule(ruleId, dto);
  }

  @Delete('ticket-sla-policies/rules/:ruleId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Desactivar regla SLA.' })
  deleteTicketSlaRule(@Param('ruleId') ruleId: string) {
    return this.svc.deleteTicketSlaRule(ruleId);
  }

  @Post('ticket-sla-policies/rules/:ruleId/conditions')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Agregar condición a una regla SLA.' })
  createTicketSlaCondition(
    @Param('ruleId') ruleId: string,
    @Body() dto: CreateTicketSlaConditionDto,
  ) {
    return this.svc.createTicketSlaCondition(ruleId, dto);
  }

  @Delete('ticket-sla-policies/conditions/:condId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Eliminar condición de una regla SLA.' })
  deleteTicketSlaCondition(@Param('condId') condId: string) {
    return this.svc.deleteTicketSlaCondition(condId);
  }
}
