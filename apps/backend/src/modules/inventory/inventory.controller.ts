import { Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { InventoryService, CreateAssetDto, AssetStatus } from './inventory.service';

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly service: InventoryService) {}

  @Get()
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Listar activos. Filtrar con ?module_id= y ?status=.' })
  @ApiQuery({ name: 'module_id', required: false })
  @ApiQuery({ name: 'status',    required: false })
  findAll(@Query('module_id') moduleId?: string, @Query('status') status?: string) {
    return this.service.findAll(moduleId, status);
  }

  @Get(':id')
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Detalle de activo.' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Get(':id/qr')
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Generar imagen QR para el activo.' })
  getQr(@Param('id') id: string) {
    return this.service.getQr(id);
  }

  @Get(':id/assignment')
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Asignación activa del activo.' })
  getCurrentAssignment(@Param('id') id: string) {
    return this.service.getCurrentAssignment(id);
  }

  @Get(':id/history')
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Historial de transiciones del activo.' })
  getHistory(@Param('id') id: string) {
    return this.service.getHistory(id);
  }

  @Post()
  @RequirePermission('inventario:items:create')
  @ApiOperation({ summary: 'Crear activo de inventario.' })
  create(@Body() dto: CreateAssetDto) {
    return this.service.create(dto);
  }

  @Post(':id/assign')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventario:items:edit')
  @ApiOperation({ summary: 'Asignar activo a usuario. Solo desde estado disponible.' })
  assign(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: { user_id: string; notes?: string },
  ) {
    return this.service.assign(id, req.user.sub, dto);
  }

  @Post(':id/unassign')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventario:items:edit')
  @ApiOperation({ summary: 'Devolver activo asignado. Estado vuelve a disponible.' })
  unassign(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.service.unassign(id, req.user.sub, body?.reason);
  }

  @Post(':id/transition')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventario:items:edit')
  @ApiOperation({ summary: 'Transición de estado FSM. No usar para asignar — usa /assign.' })
  transition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: AssetStatus; reason?: string },
  ) {
    return this.service.transition(id, req.user.sub, body);
  }

  @Patch(':id/status')
  @RequirePermission('inventario:items:edit')
  @ApiOperation({ summary: 'Actualizar estado del activo (legacy — usa /transition).' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.service.updateStatus(id, body.status);
  }
}
