import { Controller, Get, Post, Patch, Delete, Put, Body, Param, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { ProfileCompleteGuard } from '../../gateway/guards/profile-complete.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { SkipProfileCheck } from '../../gateway/decorators/skip-profile-check.decorator';
import { SystemModulesService } from './system-modules.service';

@ApiTags('system-modules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
@Controller('system-modules')
export class SystemModulesController {
  constructor(private readonly service: SystemModulesService) {}

  @Get()
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Listar módulos. Superadmin ve todos; resto solo los asignados.' })
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.sub);
  }

  @Get('locations')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Listar sedes activas para dropdowns de perfil.' })
  findLocations() {
    return this.service.findAllLocations();
  }

  @Get('locations/:locationId/environments')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Listar ambientes de una sede para dropdowns de perfil.' })
  findEnvironments(@Param('locationId') locationId: string) {
    return this.service.findEnvironmentsByLocation(locationId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de módulo con conteo de miembros.' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/roles')
  @ApiOperation({ summary: 'Roles disponibles de un módulo.' })
  getModuleRoles(@Param('id') id: string) {
    return this.service.getModuleRoles(id);
  }

  @Get(':id/technicians')
  @ApiOperation({ summary: 'Técnicos activos del módulo con rating promedio y tickets activos.' })
  getModuleTechnicians(@Param('id') id: string, @Req() req: any) {
    return this.service.getModuleTechnicians(id, req.user.sub);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Crear módulo. Solo superadmin.' })
  create(@Body() dto: Record<string, unknown>) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Editar módulo. Solo superadmin.' })
  update(@Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.service.updateModule(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Eliminar módulo (soft-delete + 90 días retención). Solo superadmin.' })
  remove(@Param('id') id: string) {
    return this.service.deleteModule(id);
  }

  @Post(':id/restore')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Restaurar módulo eliminado (dentro del período de 90 días). Solo superadmin.' })
  restore(@Param('id') id: string) {
    return this.service.restoreModule(id);
  }

  @Patch(':id/maintenance')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Activar/desactivar modo mantenimiento. Solo superadmin.' })
  toggleMaintenance(
    @Param('id') id: string,
    @Req() req: any,
    @Body() body: { enabled: boolean; message?: string },
  ) {
    return this.service.toggleMaintenance(id, req.user.sub, body.enabled, body.message);
  }

  /* ── Role management ────────────────────────────────────────────── */

  @Post(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Crear rol en un módulo. Solo superadmin.' })
  createRole(
    @Param('id') moduleId: string,
    @Body() body: { name: string; description?: string },
  ) {
    return this.service.createRole(moduleId, body.name, body.description);
  }

  @Patch('roles/:roleId')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Editar un rol. Solo superadmin.' })
  updateRole(
    @Param('roleId') roleId: string,
    @Body() body: { name?: string; description?: string },
  ) {
    return this.service.updateRole(roleId, body);
  }

  @Delete('roles/:roleId')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Desactivar un rol. Solo superadmin.' })
  deleteRole(@Param('roleId') roleId: string) {
    return this.service.deleteRole(roleId);
  }

  /* ── Module SLA rules ───────────────────────────────────────────── */

  @Get(':id/sla')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Reglas SLA del módulo (overrides + fallback global).' })
  getModuleSlaRules(@Param('id') id: string) {
    return this.service.getModuleSlaRules(id);
  }

  @Put(':id/sla/:priority')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Crear o actualizar override SLA para una prioridad.' })
  upsertModuleSlaRule(
    @Param('id')       moduleId: string,
    @Param('priority') priority: string,
    @Body() dto: { hours_to_resolve: number; hours_to_first_response: number },
  ) {
    return this.service.upsertModuleSlaRule(moduleId, priority, dto);
  }

  @Delete(':id/sla/:priority')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Eliminar override SLA (vuelve a regla global).' })
  deleteModuleSlaRule(
    @Param('id')       moduleId: string,
    @Param('priority') priority: string,
  ) {
    return this.service.deleteModuleSlaRule(moduleId, priority);
  }

}
