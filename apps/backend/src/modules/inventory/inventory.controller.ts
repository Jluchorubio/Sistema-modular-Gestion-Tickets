import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  Req, UseGuards, HttpCode, HttpStatus, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
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
  @ApiOperation({ summary: 'Listar activos. Filtrar con ?module_id= ?status= ?q=' })
  @ApiQuery({ name: 'module_id', required: false })
  @ApiQuery({ name: 'status',    required: false })
  @ApiQuery({ name: 'q',         required: false, description: 'Búsqueda por nombre, serie o QR' })
  findAll(
    @Query('module_id') moduleId?: string,
    @Query('status')    status?: string,
    @Query('q')         q?: string,
  ) {
    return this.service.findAll(moduleId, status, q);
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

  @Get(':id/tickets')
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Tickets asociados al activo.' })
  getAssetTickets(@Param('id') id: string) {
    return this.service.getAssetTickets(id);
  }

  @Get(':id/children')
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Activos hijos (parent_asset_id = id).' })
  getChildAssets(@Param('id') id: string) {
    return this.service.getChildAssets(id);
  }

  @Get(':id/images')
  @RequirePermission('inventario:items:view')
  @ApiOperation({ summary: 'Imágenes asociadas al activo.' })
  getAssetImages(@Param('id') id: string) {
    return this.service.getAssetImages(id);
  }

  @Post(':id/images')
  @RequirePermission('inventario:items:edit')
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Subir imagen al activo (máx 5 MB, JPEG/PNG/WebP).' })
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  uploadAssetImage(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.service.uploadAssetImage(id, req.user.sub, file);
  }

  @Delete(':id/images/:imageId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventario:items:edit')
  @ApiOperation({ summary: 'Eliminar imagen del activo.' })
  deleteAssetImage(@Param('id') id: string, @Param('imageId') imageId: string) {
    return this.service.deleteAssetImage(imageId, id);
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

  @Patch(':id')
  @RequirePermission('inventario:items:edit')
  @ApiOperation({ summary: 'Editar datos del activo (nombre, descripción, serie, specs).' })
  updateAsset(
    @Param('id') id: string,
    @Body() dto: {
      name?: string; description?: string; serial_number?: string;
      specifications?: Record<string, unknown>;
      environment_id?: string; category_id?: string;
    },
  ) {
    return this.service.updateAsset(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inventario:items:delete')
  @ApiOperation({ summary: 'Soft-delete del activo. No se puede eliminar si está asignado.' })
  deleteAsset(@Req() req: any, @Param('id') id: string) {
    return this.service.deleteAsset(id, req.user.sub);
  }

  @Post('bulk')
  @RequirePermission('inventario:items:create')
  @ApiOperation({ summary: 'Importación masiva de activos. Máx 100 por petición.' })
  bulkImport(@Body() dto: { module_id: string; rows: any[] }) {
    return this.service.bulkImport(dto.module_id, dto.rows);
  }
}
