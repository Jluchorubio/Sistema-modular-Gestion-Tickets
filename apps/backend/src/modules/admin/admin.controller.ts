import {
  Controller, Get, Post, Delete,
  Body, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { AdminService } from './admin.service';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('superadmin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('trash')
  @ApiOperation({ summary: 'Vista unificada de papelera. type: module|user|role|request' })
  getTrash(
    @Query('type')  type?: string,
    @Query('page')  page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.service.getTrash(type, page ? +page : 1, limit ? +limit : 50);
  }

  @Post('trash/restore')
  @ApiOperation({ summary: 'Restaurar items de la papelera.' })
  restore(@Body() body: { type: string; ids: string[] }) {
    return this.service.restoreItems(body.type, body.ids);
  }

  @Delete('trash/permanent')
  @ApiOperation({ summary: 'Eliminar permanentemente de la papelera.' })
  permanentDelete(@Body() body: { type: string; ids: string[] }) {
    return this.service.permanentDeleteItems(body.type, body.ids);
  }

  @Post('bulk-delete')
  @ApiOperation({ summary: 'Mover múltiples items a papelera (soft delete).' })
  bulkDelete(@Req() req: any, @Body() body: { type: string; ids: string[] }) {
    return this.service.bulkSoftDelete(body.type, body.ids, req.user.sub);
  }
}
