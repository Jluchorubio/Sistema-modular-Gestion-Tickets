import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query, Req, UseGuards, ParseUUIDPipe,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { TicketsService } from './tickets.service';
import { SlaBreachService } from './sla/sla-breach.service';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly svc: TicketsService,
    private readonly slaBreach: SlaBreachService,
  ) {}

  @Post('sla/breach-check')
  @UseGuards(RolesGuard) @Roles('superadmin')
  triggerBreachCheck() { return this.slaBreach.triggerManual(); }

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

  @Get('search')
  @RequirePermission('helpdesk:tickets:view')
  searchTickets(
    @Query('q') q: string,
    @Query('exclude') exclude: string,
  ) {
    return this.svc.searchTickets(q ?? '', exclude ?? '');
  }

  @Get('asset-search')
  @RequirePermission('helpdesk:tickets:view')
  searchAssets(@Query('q') q: string) {
    return this.svc.searchAssets(q ?? '');
  }

  /* ── CRUD ───────────────────────────────────────────────────────────────── */

  @Get()
  @RequirePermission('helpdesk:tickets:view')
  findAll(
    @Req() req: any,
    @Query('module_id')    moduleId?:   string,
    @Query('state_id')     stateId?:    string,
    @Query('priority')     priority?:   string,
    @Query('mine')         mine?:       string,
    @Query('category_id')  categoryId?: string,
    @Query('assignee_id')  assigneeId?: string,
    @Query('sla_status')   slaStatus?:  string,
    @Query('is_reproceso') isReproceso?: string,
    @Query('page')         page?:       string,
    @Query('limit')        limit?:      string,
  ) {
    return this.svc.findAll({
      moduleId,
      stateId,
      priority,
      userId:       mine === 'true' ? req.user.sub : undefined,
      categoryId,
      assigneeId,
      slaStatus,
      isReproceso:  isReproceso === 'true',
      page:         page  ? parseInt(page,  10) : undefined,
      limit:        limit ? parseInt(limit, 10) : undefined,
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

  /* ── Rating ─────────────────────────────────────────────────────────── */

  @Get(':id/rating')
  @RequirePermission('helpdesk:tickets:view')
  getTicketRating(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getTicketRating(id);
  }

  @Post(':id/rate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:view')
  rateTicket(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: {
      score_overall:              number;
      score_attention?:           number;
      score_clarity?:             number;
      score_response_time?:       number;
      score_quality?:             number;
      service_label?:             string;
      comment?:                   string;
      would_recommend?:           boolean;
      resolved_on_first_attempt?: boolean;
    },
  ) {
    return this.svc.rateTicket(req.user.sub, id, body);
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

  /* ── Comments ─────────────────────────────────────────────────────────── */

  @Get(':id/comments')
  @RequirePermission('helpdesk:tickets:view')
  getComments(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getComments(id);
  }

  @Post(':id/comments')
  @RequirePermission('helpdesk:comments:add')
  addComment(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { content: string; comment_type?: string },
  ) {
    return this.svc.addComment(req.user.sub, id, body);
  }

  /* ── Linked assets ───────────────────────────────────────────────────── */

  @Get(':id/assets')
  @RequirePermission('helpdesk:tickets:view')
  getTicketAssets(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getTicketAssets(id);
  }

  @Get(':id/assets/:assetId/history')
  @RequirePermission('helpdesk:tickets:view')
  getTicketAssetHistory(
    @Param('id',      ParseUUIDPipe) id:      string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.svc.getTicketAssetHistory(id, assetId);
  }

  @Get(':id/assets/:assetId/prev-tickets')
  @RequirePermission('helpdesk:tickets:view')
  getAssetPrevTickets(
    @Param('id',      ParseUUIDPipe) id:      string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.svc.getAssetPrevTickets(id, assetId);
  }

  /* ── Related tickets ─────────────────────────────────────────────────── */

  @Get(':id/relations')
  @RequirePermission('helpdesk:tickets:view')
  getRelations(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getTicketRelations(id);
  }

  @Post(':id/relations')
  @RequirePermission('helpdesk:tickets:edit')
  addRelation(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { target_ticket_id: string; relation_type: string; notes?: string },
  ) {
    return this.svc.addTicketRelation(req.user.sub, id, body);
  }

  @Delete(':id/relations/:relationId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  removeRelation(
    @Param('id',         ParseUUIDPipe) id:         string,
    @Param('relationId', ParseUUIDPipe) relationId: string,
  ) {
    return this.svc.removeTicketRelation(id, relationId);
  }

  /* ── Assignments ──────────────────────────────────────────────────────── */

  @Post(':id/assignments')
  @RequirePermission('helpdesk:tickets:assign')
  addAssignment(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { user_id: string; role: string },
  ) {
    return this.svc.addAssignment(req.user.sub, id, body);
  }
}
