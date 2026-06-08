import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { ProfileCompleteGuard } from '../../gateway/guards/profile-complete.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
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
  @RequirePermission('gestion:requests:create')
  @ApiOperation({ summary: 'Crear solicitud administrativa.' })
  create(@Req() req: any, @Body() dto: CreateRequestDto) {
    return this.service.create(req.user.sub, dto);
  }

  @Get('me')
  @RequirePermission('gestion:requests:view_own')
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
  @RequirePermission('gestion:requests:view_own')
  @ApiOperation({ summary: 'Cancelar mi solicitud (solo si está pendiente).' })
  cancelMine(@Req() req: any, @Param('id') id: string) {
    return this.service.cancelMine(req.user.sub, id);
  }

  @Patch('me/:id/complete')
  @RequirePermission('gestion:requests:view_own')
  @ApiOperation({ summary: 'Marcar tarea propia como completada.' })
  completeTask(@Req() req: any, @Param('id') id: string) {
    return this.service.completeMineTask(req.user.sub, id);
  }

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:requests:view_all')
  @ApiOperation({ summary: 'Stats de solicitudes para admin/superadmin.' })
  getStats(@Req() req: any) {
    return this.service.getStats(req.user.sub);
  }

  @Get('stats/mine')
  @RequirePermission('gestion:requests:view_own')
  @ApiOperation({ summary: 'Stats propias del usuario autenticado.' })
  getMyStats(@Req() req: any) {
    return this.service.getMyStats(req.user.sub);
  }

  @Get('user/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:requests:view_all')
  @ApiOperation({ summary: 'Solicitudes de un usuario específico. Superadmin / admin_modulo.' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findByUser(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.service.findByUser(id, limit ? parseInt(limit, 10) : 10);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:requests:view_all')
  @ApiOperation({ summary: 'Listar todas las solicitudes. Superadmin / admin_modulo.' })
  @ApiQuery({ name: 'status',    required: false })
  @ApiQuery({ name: 'type',      required: false })
  @ApiQuery({ name: 'source',    required: false })
  @ApiQuery({ name: 'escalated', required: false, type: Boolean })
  @ApiQuery({ name: 'page',      required: false, type: Number })
  @ApiQuery({ name: 'limit',     required: false, type: Number })
  findAll(
    @Req() req: any,
    @Query() q: { status?: string; type?: string; source?: string; escalated?: string; page?: string; limit?: string },
  ) {
    return this.service.findAll(req.user.sub, {
      status:    q.status,
      type:      q.type,
      source:    q.source,
      escalated: q.escalated === 'true' ? true : undefined,
      page:      q.page  ? parseInt(q.page,  10) : 1,
      limit:     q.limit ? parseInt(q.limit, 10) : 20,
    });
  }

  @Patch(':id/review')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:requests:approve')
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
  @RequirePermission('gestion:requests:take')
  @ApiOperation({ summary: 'Tomar solicitud pendiente — inicia SLA de 4 horas.' })
  take(@Req() req: any, @Param('id') id: string) {
    return this.service.take(req.user.sub, id);
  }

  @Patch(':id/progress')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:requests:progress')
  @ApiOperation({ summary: 'Actualizar progreso: in_progress | completed.' })
  updateProgress(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: 'in_progress' | 'completed' },
  ) {
    return this.service.updateProgress(req.user.sub, id, body.status);
  }

  @Post(':id/escalate')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:requests:escalate')
  @ApiOperation({ summary: 'Escalar solicitud al superadmin.' })
  escalate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { note?: string },
  ) {
    return this.service.escalate(req.user.sub, id, body.note);
  }

  @Delete(':id/escalate')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @RequirePermission('gestion:requests:escalate')
  @ApiOperation({ summary: 'Resolver escalación (superadmin).' })
  deescalate(@Req() req: any, @Param('id') id: string) {
    return this.service.deescalate(req.user.sub, id);
  }

  @Get(':id/timeline')
  @RequirePermission('gestion:requests:view_own')
  @ApiOperation({ summary: 'Historial de cambios de una solicitud.' })
  getTimeline(@Req() req: any, @Param('id') id: string) {
    return this.service.getTimeline(id, req.user.sub);
  }
}
