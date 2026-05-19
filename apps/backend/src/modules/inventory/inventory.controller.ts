import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { InventoryService, CreateAssetDto } from './inventory.service';

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

  @Post()
  @RequirePermission('inventario:items:create')
  @ApiOperation({ summary: 'Crear activo de inventario.' })
  create(@Body() dto: CreateAssetDto) {
    return this.service.create(dto);
  }

  @Patch(':id/status')
  @RequirePermission('inventario:items:edit')
  @ApiOperation({ summary: 'Actualizar estado del activo.' })
  updateStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.service.updateStatus(id, body.status);
  }
}
