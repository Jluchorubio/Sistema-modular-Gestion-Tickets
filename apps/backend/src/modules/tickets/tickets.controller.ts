import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query, Req, UseGuards, ParseUUIDPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { TicketsService } from './tickets.service';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly svc: TicketsService) {}

  /* ── Module meta — must come before :id routes ──────────────────────────── */

  @Get('categories')
  @RequirePermission('helpdesk:tickets:view')
  getCategories(@Query('module_id') moduleId: string) {
    return this.svc.getModuleCategories(moduleId);
  }

  @Get('environments')
  @RequirePermission('helpdesk:tickets:view')
  getEnvironments(@Query('module_id') moduleId: string) {
    return this.svc.getModuleEnvironments(moduleId);
  }

  @Get('workflow')
  @RequirePermission('helpdesk:tickets:view')
  getWorkflow(@Query('module_id') moduleId: string) {
    return this.svc.getModuleWorkflow(moduleId);
  }

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  @Get()
  @RequirePermission('helpdesk:tickets:view')
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
  @RequirePermission('helpdesk:tickets:view')
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(id);
  }

  @Post()
  @RequirePermission('helpdesk:tickets:create')
  create(@Req() req: any, @Body() dto: any) {
    return this.svc.create(req.user.sub, dto);
  }

  @Patch(':id/transition')
  @RequirePermission('helpdesk:tickets:edit')
  transition(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { transition_id: string; reason?: string },
  ) {
    return this.svc.transition(req.user.sub, id, body);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  approve(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { signature?: string },
  ) {
    return this.svc.approveTicket(req.user.sub, id, body);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  reject(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ) {
    return this.svc.rejectTicket(req.user.sub, id, body);
  }

  /* ── Attachments ─────────────────────────────────────────────────────── */

  @Get(':id/attachments')
  @RequirePermission('helpdesk:tickets:view')
  getAttachments(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getAttachments(id);
  }

  @Post(':id/attachments')
  @RequirePermission('helpdesk:tickets:edit')
  addAttachment(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      original_name: string;
      stored_name:   string;
      mime_type:     string;
      file_size:     number;
      file_url:      string;
    },
  ) {
    return this.svc.addAttachment(req.user.sub, id, body);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:delete')
  deleteAttachment(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.svc.deleteAttachment(req.user.sub, attachmentId);
  }
}
