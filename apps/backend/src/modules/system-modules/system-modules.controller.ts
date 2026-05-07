import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { SystemModulesService } from './system-modules.service';

@ApiTags('system-modules')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('system-modules')
export class SystemModulesController {
  constructor(private readonly service: SystemModulesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar módulos. Superadmin ve todos; resto solo los asignados.' })
  findAll(@Req() req: any) {
    return this.service.findAll(req.user.sub);
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
  @ApiOperation({ summary: 'Eliminar módulo (soft-delete). Solo superadmin.' })
  remove(@Param('id') id: string) {
    return this.service.deleteModule(id);
  }
}
