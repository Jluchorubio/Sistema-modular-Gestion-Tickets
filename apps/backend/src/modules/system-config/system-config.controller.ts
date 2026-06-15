import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus,
  ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Request } from 'express';
import { JwtAuthGuard }      from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard }        from '../../gateway/guards/roles.guard';
import { CriticalChangeGuard } from '../../gateway/guards/critical-change.guard';
import { Roles }             from '../../gateway/decorators/roles.decorator';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { Public }            from '../../gateway/decorators/public.decorator';
import { SystemConfigService } from './system-config.service';
import { AuditLogService }     from './audit-log.service';
import {
  CreateStructureTypeDto, UpdateStructureTypeDto,
  CreateOrgNodeDto, UpdateOrgNodeDto,
} from './dto/org.dto';
import {
  UpdateSlaRuleDto, UpdateCompanyDto, UpdateRequestTypeDto,
  UpdateDamageTypeDto, UpsertBusinessHourDto, CreateHolidayDto,
  CreateTicketSlaRuleDto, UpdateTicketSlaRuleDto, CreateTicketSlaConditionDto,
  UpdatePriorityFormulaDto, PreviewPriorityDto,
  CreateTicketCategoryDto, CreateDamageTypeDto, UpdatePasswordPolicyDto,
  UpdatePriorityLevelDto, UpdateUrgencyLevelDto, UpdateImpactLevelDto,
} from './dto/config.dto';
import { PriorityEngineService } from '../tickets/priority/priority-engine.service';
import { BulkImportUsersDto } from './dto/bulk-import.dto';

@ApiTags('system-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('system-config')
export class SystemConfigController {
  constructor(
    private readonly svc:            SystemConfigService,
    private readonly audit:          AuditLogService,
    private readonly priorityEngine: PriorityEngineService,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  /* ── Public endpoints (all authenticated users) ── */

  @Get('company/public')
  @Public()
  @SkipThrottle()
  @ApiOperation({ summary: 'Datos públicos de empresa (nombre, logo, color). Sin autenticación.' })
  getPublicCompanyInfo() { return this.svc.getPublicCompanyInfo(); }

  @Get('request-types')
  @ApiOperation({ summary: 'Tipos de solicitud. Filtro ?active=true para solo activos.' })
  getRequestTypes(@Query('active') active?: string) {
    return this.svc.getRequestTypes(active === 'true');
  }

  @Get('ticket-categories')
  @ApiOperation({ summary: 'Categorías de tickets (Hardware, Software, Red…). Todos los usuarios.' })
  getTicketCategories() { return this.svc.getTicketCategories(); }

  @Get('ticket-categories/all')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Todas las categorías (incluyendo inactivas). Solo superadmin.' })
  getTicketCategoriesAll() { return this.svc.getTicketCategoriesAll(); }

  @Post('ticket-categories')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Crear categoría de ticket.' })
  createTicketCategory(@Body() dto: CreateTicketCategoryDto) {
    return this.svc.createTicketCategory(dto);
  }

  @Get('damage-types/admin')
  @ApiOperation({ summary: 'Tipos de daño con inactivos. Sin module_id = solo globales (superadmin). Con module_id = globales + del módulo (admin_modulo).' })
  async getDamageTypesAdmin(@Req() req: Request, @Query('module_id') moduleId?: string) {
    const userId: string = (req as any).user?.sub;
    const isSuperadmin = await this.isUserSuperadmin(userId);
    if (moduleId) {
      const ok = isSuperadmin || await this.hasModuleRole(userId, moduleId, 'admin_modulo');
      if (!ok) throw new ForbiddenException('Requiere superadmin o admin_modulo del módulo');
    } else {
      if (!isSuperadmin) throw new ForbiddenException('Solo superadmin puede ver todos los tipos globales');
    }
    return this.svc.getDamageTypesAdmin(moduleId);
  }

  @Get('damage-types')
  @ApiOperation({ summary: 'Tipos de daño activos. ?category_id + ?module_id (incluye globales + del módulo).' })
  getDamageTypes(@Query('category_id') categoryId?: string, @Query('module_id') moduleId?: string) {
    return this.svc.getDamageTypes(categoryId, moduleId);
  }

  @Post('damage-types')
  @ApiOperation({ summary: 'Crear tipo de daño. Sin module_id = global (superadmin). Con module_id = módulo (admin_modulo).' })
  async createDamageType(@Req() req: Request, @Body() dto: CreateDamageTypeDto) {
    const userId: string = (req as any).user?.sub;
    const isSuperadmin = await this.isUserSuperadmin(userId);
    if (!dto.module_id) {
      if (!isSuperadmin) throw new ForbiddenException('Solo superadmin puede crear tipos globales');
    } else {
      const ok = isSuperadmin || await this.hasModuleRole(userId, dto.module_id, 'admin_modulo');
      if (!ok) throw new ForbiddenException('Requiere superadmin o admin_modulo del módulo');
    }
    return this.svc.createDamageType(dto);
  }

  /* ── Superadmin-only endpoints ── */

  @Post('initialize')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Marca el sistema como inicializado. Solo se llama una vez al finalizar el wizard de setup.' })
  initializeSystem() { return this.svc.initializeSystem(); }

  @Patch('company/setup')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Actualiza empresa durante el wizard de setup (sin re-auth crítica). Solo funciona antes de inicializar.' })
  async setupCompany(@Body() dto: UpdateCompanyDto) {
    return this.svc.updateCompany(dto);
  }

  @Get('company')
  @RequirePermission('global:config:view')
  getCompany() { return this.svc.getCompany(); }

  @Patch('company')
  @UseGuards(CriticalChangeGuard)
  @RequirePermission('global:config:company')
  async updateCompany(@Req() req: Request, @Body() dto: UpdateCompanyDto) {
    const prev   = await this.svc.getCompany();
    const result = await this.svc.updateCompany(dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'UPDATE',
      entityType:    'company',
      entityId:      '00000000-0000-0000-0000-000000000001',
      previousValue: prev,
      newValue:      result,
    });
    return result;
  }

  @Get('password-policy')
  @RequirePermission('global:config:view')
  getPasswordPolicy() { return this.svc.getPasswordPolicy(); }

  @Patch('password-policy')
  @UseGuards(CriticalChangeGuard)
  @RequirePermission('global:config:company')
  async updatePasswordPolicy(@Req() req: Request, @Body() dto: UpdatePasswordPolicyDto) {
    const prev   = await this.svc.getPasswordPolicy();
    const result = await this.svc.updatePasswordPolicy(dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'UPDATE',
      entityType:    'password_policy',
      entityId:      '00000000-0000-0000-0000-000000000001',
      previousValue: prev  as unknown as Record<string, unknown>,
      newValue:      result as unknown as Record<string, unknown>,
    });
    return result;
  }

  @Get('org/summary')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  getOrgSummary() { return this.svc.getOrgSummary(); }

  @Get('sla-rules')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  getSlaRules() { return this.svc.getSlaRules(); }

  @Patch('sla-rules/:id')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  async updateSlaRule(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSlaRuleDto) {
    const [prev] = await this.svc.getSlaRuleById(id);
    const result = await this.svc.updateSlaRule(id, dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'UPDATE',
      entityType:    'sla_rule',
      entityId:       id,
      previousValue:  prev,
      newValue:       result,
    });
    return result;
  }

  @Get('priority-rules')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  getPriorityRules() { return this.svc.getPriorityRules(); }

  @Patch('damage-types/:id')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Editar tipo de daño global (is_active, weight, label). Solo superadmin con re-auth.' })
  async updateDamageType(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateDamageTypeDto) {
    const prev   = await this.svc.getDamageTypeById(id);
    const result = await this.svc.updateDamageType(id, dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'UPDATE',
      entityType:    'damage_type',
      entityId:       id,
      previousValue:  prev,
      newValue:       result,
    });
    return result;
  }

  @Patch('damage-types/:id/module')
  @ApiOperation({ summary: 'Editar tipo de daño específico del módulo. Requiere admin_modulo del módulo propietario.' })
  async updateModuleDamageType(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateDamageTypeDto) {
    const dt = await this.svc.getDamageTypeById(id);
    if (!dt) throw new NotFoundException(`Tipo de daño ${id} no encontrado`);
    if (!dt.module_id) throw new ForbiddenException('Usa el endpoint estándar para tipos globales');

    const userId: string = (req as any).user?.sub;
    const ok = await this.isUserSuperadmin(userId) || await this.hasModuleRole(userId, dt.module_id, 'admin_modulo');
    if (!ok) throw new ForbiddenException('Requiere superadmin o admin_modulo del módulo');

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
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Crear o actualizar horario laboral para un día (upsert por module_id + day_of_week).' })
  async upsertBusinessHour(@Req() req: Request, @Body() dto: UpsertBusinessHourDto) {
    const result = await this.svc.upsertBusinessHour(dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:     'UPDATE',
      entityType: 'business_hour',
      entityId:   result.id,
      newValue:   result,
    });
    return result;
  }

  @Get('holidays')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Feriados. ?module_id=uuid incluye globales + los del módulo.' })
  getHolidays(@Query('module_id') moduleId?: string) {
    return this.svc.getHolidays(moduleId);
  }

  @Post('holidays')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Agregar feriado (upsert por module_id + date).' })
  async createHoliday(@Req() req: Request, @Body() dto: CreateHolidayDto) {
    const result = await this.svc.createHoliday(dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:     'CREATE',
      entityType: 'holiday',
      entityId:   result.id,
      newValue:   result,
    });
    return result;
  }

  @Delete('holidays/:id')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Desactivar feriado.' })
  async deleteHoliday(@Req() req: Request, @Param('id') id: string) {
    const result = await this.svc.deleteHoliday(id);
    await this.audit.record({
      ...req.criticalAudit!,
      action:     'DELETE',
      entityType: 'holiday',
      entityId:   id,
    });
    return result;
  }

  @Post('holidays/sync-colombia')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Sincroniza feriados de Colombia desde Nager.Date API. ?year=2026' })
  syncColombiaHolidays(@Query('year') year?: string) {
    const y = year ? parseInt(year, 10) : new Date().getFullYear();
    return this.svc.syncColombiaHolidays(y);
  }

  @Patch('request-types/:id')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:request_types')
  @ApiOperation({ summary: 'Editar tipo de solicitud (label, descripción, is_active, sort_order)' })
  async updateRequestType(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateRequestTypeDto) {
    const prev   = await this.svc.getRequestTypeById(id);
    const result = await this.svc.updateRequestType(id, dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'UPDATE',
      entityType:    'request_type',
      entityId:       id,
      previousValue:  prev,
      newValue:       result,
    });
    return result;
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
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Agregar regla SLA a una política.' })
  async createTicketSlaRule(
    @Req() req: Request,
    @Param('policyId') policyId: string,
    @Body() dto: CreateTicketSlaRuleDto,
  ) {
    const result = await this.svc.createTicketSlaRule(policyId, dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:     'CREATE',
      entityType: 'ticket_sla_rule',
      entityId:    result.id,
      newValue:    result,
    });
    return result;
  }

  @Patch('ticket-sla-policies/rules/:ruleId')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Actualizar regla SLA (nombre, horas, prioridad, is_active).' })
  async updateTicketSlaRule(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() dto: UpdateTicketSlaRuleDto,
  ) {
    const prev   = await this.svc.getTicketSlaRuleById(ruleId);
    const result = await this.svc.updateTicketSlaRule(ruleId, dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'UPDATE',
      entityType:    'ticket_sla_rule',
      entityId:       ruleId,
      previousValue:  prev,
      newValue:       result,
    });
    return result;
  }

  @Delete('ticket-sla-policies/rules/:ruleId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Desactivar regla SLA.' })
  async deleteTicketSlaRule(@Req() req: Request, @Param('ruleId') ruleId: string) {
    const prev   = await this.svc.getTicketSlaRuleById(ruleId);
    const result = await this.svc.deleteTicketSlaRule(ruleId);
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'DELETE',
      entityType:    'ticket_sla_rule',
      entityId:       ruleId,
      previousValue:  prev,
    });
    return result;
  }

  @Post('ticket-sla-policies/rules/:ruleId/conditions')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Agregar condición a una regla SLA.' })
  async createTicketSlaCondition(
    @Req() req: Request,
    @Param('ruleId') ruleId: string,
    @Body() dto: CreateTicketSlaConditionDto,
  ) {
    const result = await this.svc.createTicketSlaCondition(ruleId, dto);
    await this.audit.record({
      ...req.criticalAudit!,
      action:     'CREATE',
      entityType: 'ticket_sla_condition',
      entityId:    result.id,
      newValue:    { ...result, ruleId },
    });
    return result;
  }

  @Delete('ticket-sla-policies/conditions/:condId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Eliminar condición de una regla SLA.' })
  async deleteTicketSlaCondition(@Req() req: Request, @Param('condId') condId: string) {
    const result = await this.svc.deleteTicketSlaCondition(condId);
    await this.audit.record({
      ...req.criticalAudit!,
      action:     'DELETE',
      entityType: 'ticket_sla_condition',
      entityId:    condId,
    });
    return result;
  }

  /* ── Dynamic org: structure types ──────────────────────────────── */

  @Get('org/structure-types')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Tipos de estructura org. ?active=true para solo activos.' })
  getStructureTypes(@Query('active') active?: string) {
    return this.svc.getStructureTypes(active === 'true');
  }

  @Post('org/structure-types')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  @ApiOperation({ summary: 'Crear nuevo tipo de nodo org (Sede, Depto, Área, etc.).' })
  createStructureType(@Body() dto: CreateStructureTypeDto) {
    return this.svc.createStructureType(dto);
  }

  @Patch('org/structure-types/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  updateStructureType(@Param('id') id: string, @Body() dto: UpdateStructureTypeDto) {
    return this.svc.updateStructureType(id, dto);
  }

  @Delete('org/structure-types/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  @ApiOperation({ summary: 'Soft-delete tipo de estructura (90 días en papelera).' })
  deleteStructureType(@Param('id') id: string) {
    return this.svc.deleteStructureType(id);
  }

  /* ── Dynamic org: nodes ─────────────────────────────────────────── */

  @Get('org/nodes/by-slug')
  @ApiOperation({ summary: 'Nodos activos por slug de tipo (acceso a todos los usuarios autenticados). Para formularios de perfil.' })
  getOrgNodesBySlug(@Query('slug') slug: string) {
    return this.svc.getOrgNodesBySlug(slug ?? '');
  }

  @Get('org/nodes')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Nodos org. Filtros: ?type_id=uuid &parent_id=uuid &active=true.' })
  getOrgNodes(
    @Query('type_id')   typeId?:   string,
    @Query('parent_id') parentId?: string,
    @Query('active')    active?:   string,
  ) {
    return this.svc.getOrgNodes({ type_id: typeId, parent_id: parentId, active_only: active === 'true' });
  }

  @Get('org/nodes/tree')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Árbol completo de nodos org activos.' })
  getOrgNodeTree() { return this.svc.getOrgNodeTree(); }

  @Post('org/nodes')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  createOrgNode(@Body() dto: CreateOrgNodeDto) { return this.svc.createOrgNode(dto); }

  @Patch('org/nodes/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  updateOrgNode(@Param('id') id: string, @Body() dto: UpdateOrgNodeDto) {
    return this.svc.updateOrgNode(id, dto);
  }

  @Delete('org/nodes/:id')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:org')
  deleteOrgNode(@Param('id') id: string) { return this.svc.deleteOrgNode(id); }

  /* ── Priority formula ──────────────────────────────────────────── */

  @Get('priority-formula')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Fórmula de prioridad activa (pesos + umbrales).' })
  getPriorityFormula() { return this.svc.getPriorityFormula(); }

  @Patch('priority-formula')
  @UseGuards(RolesGuard, CriticalChangeGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Actualizar coeficientes de la fórmula de prioridad. Los pesos deben sumar 1.' })
  async updatePriorityFormula(@Req() req: Request, @Body() dto: UpdatePriorityFormulaDto) {
    const prev   = await this.svc.getPriorityFormula();
    const result = await this.svc.updatePriorityFormula(dto);
    this.priorityEngine.invalidateFormulaCache();
    await this.audit.record({
      ...req.criticalAudit!,
      action:        'UPDATE',
      entityType:    'priority_formula',
      entityId:       result?.id,
      previousValue:  prev,
      newValue:       result,
    });
    return result;
  }

  @Post('priority-formula/preview')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Simular score/prioridad dado pesos de cargo, nodo y daño.' })
  previewPriority(@Body() dto: PreviewPriorityDto) {
    return this.svc.previewPriority(dto);
  }

  /* ── Priority / Urgency / Impact levels (configurables) ────────── */

  @Get('priority-levels')
  @ApiOperation({ summary: 'Niveles de prioridad de ticket. Disponible para todos los usuarios autenticados.' })
  getPriorityLevels() { return this.svc.getPriorityLevels(); }

  @Patch('priority-levels/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Editar nivel de prioridad (label, sort_order, is_active). Slug inmutable.' })
  async updatePriorityLevel(@Param('id') id: string, @Body() dto: UpdatePriorityLevelDto) {
    const result = await this.svc.updatePriorityLevel(id, dto);
    this.priorityEngine.invalidateLevelsCache();
    return result;
  }

  @Get('urgency-levels')
  @ApiOperation({ summary: 'Niveles de urgencia de ticket. Disponible para todos los usuarios autenticados.' })
  getUrgencyLevels() { return this.svc.getUrgencyLevels(); }

  @Patch('urgency-levels/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Editar nivel de urgencia (label, bonus, sort_order, is_active). Slug inmutable.' })
  async updateUrgencyLevel(@Param('id') id: string, @Body() dto: UpdateUrgencyLevelDto) {
    const result = await this.svc.updateUrgencyLevel(id, dto);
    this.priorityEngine.invalidateLevelsCache();
    return result;
  }

  @Get('impact-levels')
  @ApiOperation({ summary: 'Niveles de impacto de ticket. Disponible para todos los usuarios autenticados.' })
  getImpactLevels() { return this.svc.getImpactLevels(); }

  @Patch('impact-levels/:id')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:sla')
  @ApiOperation({ summary: 'Editar nivel de impacto (label, bonus, sort_order, is_active). Slug inmutable.' })
  async updateImpactLevel(@Param('id') id: string, @Body() dto: UpdateImpactLevelDto) {
    const result = await this.svc.updateImpactLevel(id, dto);
    this.priorityEngine.invalidateLevelsCache();
    return result;
  }

  /* ── Audit log ──────────────────────────────────────────────────── */

  @Get('audit-logs')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @RequirePermission('global:config:view')
  @ApiOperation({ summary: 'Historial de cambios críticos en configuración del sistema.' })
  getAuditLogs(
    @Query('limit')       limit?:       string,
    @Query('offset')      offset?:      string,
    @Query('entity_type') entityType?:  string,
    @Query('entity_id')   entityId?:    string,
    @Query('user_id')     userId?:      string,
  ) {
    return this.audit.getLogs({
      limit:       limit  ? Number(limit)  : undefined,
      offset:      offset ? Number(offset) : undefined,
      entity_type: entityType,
      entity_id:   entityId,
      user_id:     userId,
    });
  }

  /* ── Private role-check helpers (DB-backed, not JWT payload) ── */

  private async isUserSuperadmin(userId: string): Promise<boolean> {
    if (!userId) return false;
    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );
    return profile?.is_superadmin ?? false;
  }

  private async hasModuleRole(userId: string, moduleId: string, roleName: string): Promise<boolean> {
    if (!userId || !moduleId) return false;
    const [row] = await this.db.query<{ id: string }[]>(
      `SELECT umr.id
       FROM   modules.user_module_roles umr
       JOIN   modules.module_roles      mr  ON mr.id = umr.role_id
       JOIN   modules.system_modules    sm  ON sm.id = umr.module_id
       WHERE  umr.user_id   = $1
         AND  umr.module_id = $2
         AND  mr.name       = $3
         AND  umr.is_active = true
       LIMIT 1`,
      [userId, moduleId, roleName],
    );
    return !!row;
  }
}
