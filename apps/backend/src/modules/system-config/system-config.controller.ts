import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
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
import { UpdateSlaRuleDto, UpdateCompanyDto, UpdateRequestTypeDto } from './dto/config.dto';
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
}
