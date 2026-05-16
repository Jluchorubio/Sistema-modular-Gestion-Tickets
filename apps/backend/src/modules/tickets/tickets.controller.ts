import {
  Controller, Get, Post, Patch, Body, Param, Query, Req, UseGuards, ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly svc: TicketsService) {}

  /* ── Module meta — must come before :id routes ──────────────────────────── */

  @Get('categories')
  getCategories(@Query('module_id') moduleId: string) {
    return this.svc.getModuleCategories(moduleId);
  }

  @Get('environments')
  getEnvironments(@Query('module_id') moduleId: string) {
    return this.svc.getModuleEnvironments(moduleId);
  }

  @Get('workflow')
  getWorkflow(@Query('module_id') moduleId: string) {
    return this.svc.getModuleWorkflow(moduleId);
  }

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  @Get()
  findAll(
    @Req() req: any,
    @Query('module_id') moduleId?: string,
    @Query('state_id')  stateId?:  string,
    @Query('priority')  priority?: string,
    @Query('mine')      mine?:     string,
    @Query('page')      page?:     string,
    @Query('limit')     limit?:    string,
  ) {
    return this.svc.findAll({
      moduleId,
      stateId,
      priority,
      userId: mine === 'true' ? req.user.sub : undefined,
      page:   page  ? parseInt(page,  10) : undefined,
      limit:  limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: any) {
    return this.svc.create(req.user.sub, dto);
  }

  @Patch(':id/transition')
  transition(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { transition_id: string; reason?: string },
  ) {
    return this.svc.transition(req.user.sub, id, body);
  }
}
