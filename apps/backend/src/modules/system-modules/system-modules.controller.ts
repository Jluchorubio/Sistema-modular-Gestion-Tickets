import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
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
}
