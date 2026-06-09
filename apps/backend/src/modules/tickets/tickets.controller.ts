import {
  Controller, Get, Post, Delete, Patch, Body, Param, Query, Req, UseGuards, ParseUUIDPipe,
  HttpCode, HttpStatus, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { RequestWithUser } from '../../gateway/types';
import { TicketsService } from './tickets.service';
import { KnowledgeService } from './knowledge/knowledge.service';
import { SlaBreachService } from './sla/sla-breach.service';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { CreateTicketDto } from './dto/create-ticket.dto';
import { TransitionTicketDto } from './dto/transition-ticket.dto';
import { Throttle } from '@nestjs/throttler';
import { CreateKnowledgeArticleDto, UpdateKnowledgeArticleDto } from './dto/knowledge-article.dto';
import { AddCommentDto, AddAttachmentDto, ApproveTicketDto, RejectTicketDto, AddAssignmentDto, AddRelationDto, RateTicketDto } from './dto/ticket-actions.dto';

@ApiTags('tickets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly svc: TicketsService,
    private readonly knowledge: KnowledgeService,
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

  @Patch('transitions/:id')
  @RequirePermission('global:config:sla')
  updateTransition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { allowed_roles?: string[]; variant?: string; name?: string },
  ) {
    return this.svc.updateTransition(id, body);
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
    @Req() req: RequestWithUser,
    @Query('module_id')   moduleId?:   string,
    @Query('state_id')    stateId?:    string,
    @Query('priority')    priority?:   string,
    @Query('mine')        mine?:       string,
    @Query('category_id') categoryId?: string,
    @Query('assignee_id') assigneeId?: string,
    @Query('sla_status')  slaStatus?:  string,
    @Query('unassigned')  unassigned?: string,
    @Query('page')        page?:       string,
    @Query('limit')       limit?:      string,
  ) {
    return this.svc.findAll({
      moduleId,
      stateId,
      priority,
      userId:     mine === 'true' ? req.user.sub : undefined,
      categoryId,
      assigneeId,
      slaStatus,
      unassigned: unassigned === 'true',
      page:       page  ? parseInt(page,  10) : undefined,
      limit:      limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @RequirePermission('helpdesk:tickets:view')
  findOne(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.findOne(id, req.user.sub);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @RequirePermission('helpdesk:tickets:create')
  create(@Req() req: RequestWithUser, @Body() dto: CreateTicketDto) {
    return this.svc.create(req.user.sub, dto);
  }

  @Patch(':id/transition')
  @RequirePermission('helpdesk:tickets:edit')
  transition(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: TransitionTicketDto,
  ) {
    return this.svc.transition(req.user.sub, id, body);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  approve(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApproveTicketDto,
  ) {
    return this.svc.approveTicket(req.user.sub, id, body);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  reject(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RejectTicketDto,
  ) {
    return this.svc.rejectTicket(req.user.sub, id, body);
  }

  @Post(':id/force-reopen')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  forceReopen(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason: string },
  ) {
    return this.svc.forceReopenTicket(req.user.sub, id, body);
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
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RateTicketDto,
  ) {
    return this.svc.rateTicket(req.user.sub, id, body);
  }

  /* ── Timeline ───────────────────────────────────────────────────────── */

  @Get(':id/timeline')
  @RequirePermission('helpdesk:tickets:view')
  getTimeline(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getTimeline(id);
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
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddAttachmentDto,
  ) {
    return this.svc.addAttachment(req.user.sub, id, body);
  }

  @Delete(':id/attachments/:attachmentId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:delete')
  deleteAttachment(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ) {
    return this.svc.deleteAttachment(req.user.sub, id, attachmentId);
  }

  /* ── Comments ─────────────────────────────────────────────────────────── */

  @Get(':id/comments')
  @RequirePermission('helpdesk:tickets:view')
  getComments(@Req() req: RequestWithUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getComments(id, req.user.sub);
  }

  @Post(':id/comments')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @RequirePermission('helpdesk:comments:add')
  addComment(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddCommentDto,
  ) {
    return this.svc.addComment(req.user.sub, id, body);
  }

  /* ── Linked assets ───────────────────────────────────────────────────── */

  @Get(':id/assets')
  @RequirePermission('helpdesk:tickets:view')
  getTicketAssets(@Param('id', ParseUUIDPipe) id: string) {
    return this.svc.getTicketAssets(id);
  }

  @Post(':id/assets')
  @RequirePermission('helpdesk:tickets:edit')
  linkAsset(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { asset_id: string; notes?: string },
  ) {
    return this.svc.linkAsset(id, body.asset_id, body.notes);
  }

  @Delete(':id/assets/:assetId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  unlinkAsset(
    @Param('id',      ParseUUIDPipe) id:      string,
    @Param('assetId', ParseUUIDPipe) assetId: string,
  ) {
    return this.svc.unlinkAsset(id, assetId);
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
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddRelationDto,
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
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: AddAssignmentDto,
  ) {
    return this.svc.addAssignment(req.user.sub, id, body);
  }

  @Get('assignments/history')
  @RequirePermission('helpdesk:tickets:view')
  getAssignmentHistory(
    @Query('user_id')   userId:    string,
    @Query('module_id') moduleId?: string,
    @Query('limit')     limit?:    string,
  ) {
    return this.svc.getAssignmentHistory(userId, moduleId, limit ? parseInt(limit, 10) : 50);
  }

  /* ── Knowledge Base ─────────────────────────────────────────────────────── */

  @Post('knowledge/upload-doc')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:create')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 },
  }))
  async uploadKnowledgeDoc(
    @Req() req: RequestWithUser,
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { module_id: string; title?: string; category?: string; tags?: string },
  ) {
    if (!file) throw new Error('No file uploaded');
    const path = require('path');
    const fs   = require('fs');
    const ALLOWED_EXTS  = ['.pdf','.doc','.docx','.xls','.xlsx','.ppt','.pptx','.txt','.csv','.zip','.png','.jpg','.jpeg','.gif','.webp'];
    const ALLOWED_MIMES = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation','text/plain','text/csv','application/zip','application/x-zip-compressed','image/png','image/jpeg','image/gif','image/webp'];
    const ext  = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTS.includes(ext) || !ALLOWED_MIMES.includes(file.mimetype)) {
      throw new Error('Tipo de archivo no permitido.');
    }
    const name = `knowledge-${Date.now()}${ext}`;
    const uploadsDir = process.env.STORAGE_PATH ?? './uploads';
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, name), file.buffer);
    const backendUrl = process.env.BACKEND_URL ?? 'http://localhost:3001';
    const fileUrl = `${backendUrl}/uploads/${name}`;

    return this.knowledge.createArticle(req.user.sub, {
      module_id:    body.module_id,
      title:        (body.title?.trim() || file.originalname).trim(),
      content:      '',
      category:     body.category?.trim() || undefined,
      tags:         body.tags ? body.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      is_published: true,
      doc_type:     'file',
      file_url:     fileUrl,
      file_name:    file.originalname,
      file_size:    file.size,
      file_mime:    file.mimetype,
    });
  }

  @Get('knowledge')
  @RequirePermission('helpdesk:tickets:view')
  getKnowledgeArticles(
    @Query('module_id')      moduleId?: string,
    @Query('q')              q?: string,
    @Query('include_drafts') includeDrafts?: string,
  ) {
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!moduleId || !UUID_RE.test(moduleId)) return [];
    return this.knowledge.getArticles(moduleId, q, includeDrafts === 'true');
  }

  @Get('knowledge/:id')
  @RequirePermission('helpdesk:tickets:view')
  getKnowledgeArticle(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.getArticle(id);
  }

  @Post('knowledge')
  @RequirePermission('helpdesk:tickets:create')
  createKnowledgeArticle(
    @Req() req: RequestWithUser,
    @Body() body: CreateKnowledgeArticleDto,
  ) {
    return this.knowledge.createArticle(req.user.sub, body);
  }

  @Patch('knowledge/:id')
  @RequirePermission('helpdesk:tickets:edit')
  updateKnowledgeArticle(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: UpdateKnowledgeArticleDto,
  ) {
    return this.knowledge.updateArticle(id, req.user.sub, body);
  }

  @Delete('knowledge/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  deleteKnowledgeArticle(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.deleteArticle(id);
  }

  @Post('knowledge/:id/vote')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:view')
  voteArticle(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { value: 1 | -1 },
  ) {
    return this.knowledge.voteArticle(req.user.sub, id, body.value);
  }

  @Post(':id/to-article')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:edit')
  convertTicketToArticle(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { module_id: string; title: string; content: string; category?: string; tags?: string[] },
  ) {
    return this.knowledge.convertTicketToArticle(req.user.sub, id, body);
  }

  /* ── Forum posts ─────────────────────────────────────────────────────── */

  @Get('knowledge-posts')
  @RequirePermission('helpdesk:tickets:view')
  getKnowledgePosts(
    @Query('module_id') moduleId: string,
    @Query('q')         q?: string,
    @Query('filter')    filter?: string,
  ) {
    if (!moduleId) return [];
    return this.knowledge.getPosts(moduleId, q, filter);
  }

  @Get('knowledge-posts/:id')
  @RequirePermission('helpdesk:tickets:view')
  getKnowledgePost(@Param('id', ParseUUIDPipe) id: string) {
    return this.knowledge.getPost(id);
  }

  @Post('knowledge-posts')
  @RequirePermission('helpdesk:tickets:view')
  createKnowledgePost(
    @Req() req: RequestWithUser,
    @Body() body: { module_id: string; title: string; content: string; tags?: string[] },
  ) {
    return this.knowledge.createPost(req.user.sub, body);
  }

  @Post('knowledge-posts/:id/replies')
  @RequirePermission('helpdesk:tickets:view')
  createReply(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { content: string },
  ) {
    return this.knowledge.createReply(req.user.sub, id, body);
  }

  @Post('knowledge-posts/:postId/replies/:replyId/accept')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:view')
  acceptReply(
    @Req() req: RequestWithUser,
    @Param('postId',  ParseUUIDPipe) postId: string,
    @Param('replyId', ParseUUIDPipe) replyId: string,
  ) {
    return this.knowledge.acceptReply(req.user.sub, postId, replyId);
  }

  @Delete('knowledge-posts/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:view')
  deleteKnowledgePost(
    @Req() req: RequestWithUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.knowledge.deletePost(req.user.sub, id);
  }

  @Delete('knowledge-posts/:postId/replies/:replyId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('helpdesk:tickets:view')
  deleteReply(
    @Req() req: RequestWithUser,
    @Param('postId',  ParseUUIDPipe) _postId: string,
    @Param('replyId', ParseUUIDPipe) replyId: string,
  ) {
    return this.knowledge.deleteReply(req.user.sub, replyId);
  }
}
