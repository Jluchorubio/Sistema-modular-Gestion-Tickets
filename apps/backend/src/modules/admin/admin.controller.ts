import {
  Controller, Get, Post, Delete,
  Body, Query, Req, UseGuards, HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('trash')
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Vista unificada de papelera. type: module|user|role|request. moduleId filtra solo requests del módulo.' })
  getTrash(
    @Query('type')     type?: string,
    @Query('page')     page?: string,
    @Query('limit')    limit?: string,
    @Query('moduleId') moduleId?: string,
  ) {
    return this.service.getTrash(type, page ? +page : 1, limit ? +limit : 50, moduleId);
  }

  @Post('trash/restore')
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Restaurar items de la papelera.' })
  restore(@Body() body: { type: string; ids: string[] }) {
    return this.service.restoreItems(body.type, body.ids);
  }

  @Delete('trash/permanent')
  @RequirePermission('global:trash:purge')
  @ApiOperation({ summary: 'Eliminar permanentemente de la papelera.' })
  permanentDelete(@Body() body: { type: string; ids: string[] }) {
    return this.service.permanentDeleteItems(body.type, body.ids);
  }

  @Post('trash/purge-expired')
  @HttpCode(200)
  @RequirePermission('global:trash:purge')
  @ApiOperation({ summary: 'Borrado definitivo de items cuyo período de retención expiró.' })
  purgeExpired() {
    return this.service.purgeExpired();
  }

  @Post('bulk-delete')
  @RequirePermission('global:users:delete')
  @ApiOperation({ summary: 'Mover múltiples items a papelera (soft delete).' })
  bulkDelete(@Req() req: any, @Body() body: { type: string; ids: string[] }) {
    return this.service.bulkSoftDelete(body.type, body.ids, req.user.sub);
  }
}
