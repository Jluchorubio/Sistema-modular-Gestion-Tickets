import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { ProfileCompleteGuard } from '../../gateway/guards/profile-complete.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { RequestsService } from './requests.service';
import { CreateRequestDto } from './dto/create-request.dto';
import { ReviewRequestDto } from './dto/review-request.dto';

@ApiTags('requests')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
@Controller('requests')
export class RequestsController {
  constructor(private readonly service: RequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear solicitud administrativa.' })
  create(@Req() req: any, @Body() dto: CreateRequestDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Mis solicitudes.' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  findMine(
    @Req() req: any,
    @Query() q: { status?: string; page?: string; limit?: string },
  ) {
    return this.service.findMine(req.user.sub, {
      status: q.status,
      page:   q.page  ? parseInt(q.page,  10) : 1,
      limit:  q.limit ? parseInt(q.limit, 10) : 10,
    });
  }

  @Delete('me/:id')
  @ApiOperation({ summary: 'Cancelar mi solicitud (solo si está pendiente).' })
  cancelMine(@Req() req: any, @Param('id') id: string) {
    return this.service.cancelMine(req.user.sub, id);
  }

  @Patch('me/:id/complete')
  @ApiOperation({ summary: 'Marcar tarea propia como completada.' })
  completeTask(@Req() req: any, @Param('id') id: string) {
    return this.service.completeMineTask(req.user.sub, id);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Listar todas las solicitudes. Superadmin / admin_modulo.' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'type',   required: false })
  @ApiQuery({ name: 'source', required: false })
  @ApiQuery({ name: 'page',   required: false, type: Number })
  @ApiQuery({ name: 'limit',  required: false, type: Number })
  findAll(@Query() q: { status?: string; type?: string; source?: string; page?: string; limit?: string }) {
    return this.service.findAll({
      status: q.status,
      type:   q.type,
      source: q.source,
      page:   q.page  ? parseInt(q.page,  10) : 1,
      limit:  q.limit ? parseInt(q.limit, 10) : 20,
    });
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Revisar solicitud (aprobar / rechazar / en revisión). Superadmin / admin_modulo.' })
  review(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: ReviewRequestDto,
  ) {
    return this.service.review(req.user.sub, id, dto);
  }

  @Post(':id/take')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Tomar solicitud pendiente — inicia SLA de 4 horas.' })
  take(@Req() req: any, @Param('id') id: string) {
    return this.service.take(req.user.sub, id);
  }

  @Patch(':id/progress')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Actualizar progreso: in_progress | completed.' })
  updateProgress(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: 'in_progress' | 'completed' },
  ) {
    return this.service.updateProgress(req.user.sub, id, body.status);
  }

  @Get(':id/timeline')
  @ApiOperation({ summary: 'Historial de cambios de una solicitud.' })
  getTimeline(@Req() req: any, @Param('id') id: string) {
    return this.service.getTimeline(id, req.user.sub);
  }
}
