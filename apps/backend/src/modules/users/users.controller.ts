import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Body,
  Param,
  Query,
  Req,
  ParseUUIDPipe,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { ProfileCompleteGuard } from '../../gateway/guards/profile-complete.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { SkipProfileCheck } from '../../gateway/decorators/skip-profile-check.decorator';
import { RequirePermission } from '../../gateway/decorators/require-permission.decorator';
import { UsersService } from './users.service';
import { ProfileService } from './profile.service';
import { RoleService } from './role.service';
import { SkillService } from './skill.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { PreferencesDto } from './dto/preferences.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { AvailabilityDto } from './dto/availability.dto';
import { AddSkillDto } from './dto/add-skill.dto';
import { UpdateSkillDto } from './dto/update-skill.dto';
import { CompleteProfileDto } from './dto/complete-profile.dto';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, ProfileCompleteGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService:   UsersService,
    private readonly profileService: ProfileService,
    private readonly roleService:    RoleService,
    private readonly skillService:   SkillService,
  ) {}

  // ─── CRUD (superadmin / admin_modulo) ────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:create')
  @ApiOperation({ summary: 'Crear usuario. Solo superadmin o admin_modulo.' })
  create(@Req() req: any, @Body() dto: CreateUserDto) {
    return this.usersService.createUser(req.user.sub, dto);
  }

  @Post('bulk-import')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:create')
  @ApiOperation({ summary: 'Importar múltiples usuarios desde CSV/Excel. Máx 200 filas.' })
  bulkImport(
    @Req() req: any,
    @Body() body: { rows: { first_name: string; last_name: string; email: string; username?: string; is_superadmin?: boolean }[] },
  ) {
    if (!Array.isArray(body.rows) || body.rows.length === 0) {
      throw new BadRequestException('No hay filas para importar');
    }
    if (body.rows.length > 200) {
      throw new BadRequestException('Máximo 200 usuarios por importación');
    }
    return this.usersService.bulkImportUsers(req.user.sub, body.rows);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:view')
  @ApiOperation({ summary: 'Listar usuarios con filtros y paginación.' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiQuery({ name: 'is_superadmin', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Query() query: { search?: string; is_active?: string; is_superadmin?: string; page?: string; limit?: string }) {
    return this.usersService.listUsers({
      search:        query.search,
      is_active:     query.is_active     !== undefined ? query.is_active     === 'true' : undefined,
      is_superadmin: query.is_superadmin !== undefined ? query.is_superadmin === 'true' : undefined,
      page:          query.page  ? parseInt(query.page,  10) : 1,
      limit:         query.limit ? parseInt(query.limit, 10) : 20,
    });
  }

  @Get('me')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Perfil propio completo.' })
  getMe(@Req() req: any) {
    return this.profileService.getMyProfile(req.user.sub);
  }

  @Patch('me')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Actualizar mi perfil (phone, avatar_url).' })
  updateMe(@Req() req: any, @Body() dto: UpdateUserDto) {
    return this.profileService.updateMyProfile(req.user.sub, dto);
  }

  @Patch('me/complete-profile')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Completar perfil obligatorio. Desbloquea acceso al sistema.' })
  completeProfile(@Req() req: any, @Body() dto: CompleteProfileDto) {
    return this.profileService.completeMyProfile(req.user.sub, dto);
  }

  @Patch('me/password')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Cambiar contraseña propia.' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.profileService.changePassword(req.user.sub, dto);
  }

  @Get('me/sessions')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Historial de sesiones propias — últimas 20.' })
  getMySessions(@Req() req: any) {
    return this.profileService.getMySessions(req.user.sub);
  }

  @Get('me/activity')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Gráfica de actividad propia — últimas 26 semanas.' })
  getMyActivity(@Req() req: any) {
    return this.profileService.getActivityGraph(req.user.sub);
  }

  @Get('me/preferences')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Ver preferencias propias.' })
  getPreferences(@Req() req: any) {
    return this.profileService.getMyPreferences(req.user.sub);
  }

  @Get('me/recent-tickets')
  @ApiOperation({ summary: 'Últimos tickets creados por el usuario. ?limit=N (default 6).' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyRecentTickets(@Req() req: any, @Query('limit') limit?: string) {
    return this.profileService.getMyRecentTickets(req.user.sub, limit ? parseInt(limit, 10) : 6);
  }

  @Get('me/assigned-tickets')
  @ApiOperation({ summary: 'Tickets activos asignados al usuario.' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getMyAssignedTickets(@Req() req: any, @Query('limit') limit?: string) {
    return this.profileService.getMyAssignedTickets(req.user.sub, limit ? parseInt(limit, 10) : 50);
  }

  @Get('me/activity-feed')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Feed de actividad propia — últimos 20 eventos.' })
  getMyActivityFeed(@Req() req: any) {
    return this.profileService.getActivityFeed(req.user.sub);
  }

  @Get('me/request-stats')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Estadísticas de solicitudes y tickets propios.' })
  getMyRequestStats(@Req() req: any) {
    return this.profileService.getUserRequestStats(req.user.sub);
  }

  @Put('me/preferences')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Actualizar preferencias propias.' })
  upsertPreferences(@Req() req: any, @Body() dto: PreferencesDto) {
    return this.profileService.upsertMyPreferences(req.user.sub, dto);
  }

  @Get('module/:moduleId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:users:view')
  @ApiOperation({ summary: 'Usuarios activos de un módulo con sus roles.' })
  getUsersByModule(@Param('moduleId', ParseUUIDPipe) moduleId: string) {
    return this.roleService.getUsersByModule(moduleId);
  }

  // ─── System stats (superadmin) ───────────────────────────────────────────────

  @Get('stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Estadísticas globales del sistema. Solo superadmin.' })
  getSystemStats() {
    return this.roleService.getSystemStats();
  }

  // ─── Roles globales ──────────────────────────────────────────────────────────

  @Get('global-roles')
  @RequirePermission('global:roles:view')
  @ApiOperation({ summary: 'Listar roles globales del sistema.' })
  listGlobalRoles() {
    return this.roleService.listGlobalRoles();
  }

  @Post('global-roles')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @RequirePermission('global:roles:create')
  @ApiOperation({ summary: 'Crear nuevo rol global. Solo superadmin.' })
  createGlobalRole(@Body() body: { name: string; description?: string }) {
    return this.roleService.createGlobalRole(body.name, body.description);
  }

  @Delete('global-roles/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @RequirePermission('global:roles:delete')
  @ApiOperation({ summary: 'Desactivar rol global (soft-delete). Solo superadmin.' })
  deleteGlobalRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleService.deleteGlobalRole(id);
  }

  @Patch('global-roles/:id/reactivate')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @RequirePermission('global:roles:edit')
  @ApiOperation({ summary: 'Reactivar rol global desactivado. Solo superadmin.' })
  reactivateGlobalRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleService.reactivateGlobalRole(id);
  }

  // ─── Asignación masiva por módulo ────────────────────────────────────────────

  @Post('module/:moduleId/bulk-assign')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('gestion:users:assign_role')
  @ApiOperation({ summary: 'Asignar rol a múltiples usuarios en un módulo.' })
  bulkAssign(
    @Req() req: any,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() body: { user_ids: string[]; role_id: string },
  ) {
    return this.roleService.bulkAssignModuleRole(req.user.sub, body.user_ids, moduleId, body.role_id);
  }

  @Post('module/:moduleId/bulk-import-assign')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:create')
  @ApiOperation({ summary: 'Importar usuarios desde CSV y asignarlos a un módulo.' })
  async bulkImportAssign(
    @Req() req: any,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() body: { rows: { first_name: string; last_name: string; email: string; username?: string }[]; role_id: string },
  ) {
    if (!Array.isArray(body.rows) || body.rows.length === 0) throw new BadRequestException('No hay filas para importar');
    if (body.rows.length > 200) throw new BadRequestException('Máximo 200 usuarios por importación');
    if (!body.role_id) throw new BadRequestException('Se requiere role_id');

    const { user_ids, created, existing, failed } = await this.usersService.bulkImportForModule(req.user.sub, body.rows);

    let assigned = 0;
    if (user_ids.length > 0) {
      await this.roleService.bulkAssignModuleRole(req.user.sub, user_ids, moduleId, body.role_id);
      assigned = user_ids.length;
    }

    return { created, existing, assigned, failed, total: body.rows.length };
  }

  @Get(':id/activity')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:view')
  @ApiOperation({ summary: 'Gráfica de actividad de un usuario — últimas 26 semanas.' })
  getUserActivity(@Param('id', ParseUUIDPipe) id: string) {
    return this.profileService.getActivityGraph(id);
  }

  @Get(':id/recent-tickets')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:view')
  @ApiOperation({ summary: 'Últimos tickets de un usuario. ?limit=N (default 6).' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getUserRecentTickets(@Param('id', ParseUUIDPipe) id: string, @Query('limit') limit?: string) {
    return this.profileService.getMyRecentTickets(id, limit ? parseInt(limit, 10) : 6);
  }

  @Get(':id/activity-feed')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:view')
  @ApiOperation({ summary: 'Feed de actividad de un usuario — últimos 20 eventos.' })
  getUserActivityFeed(@Param('id', ParseUUIDPipe) id: string) {
    return this.profileService.getActivityFeed(id);
  }

  @Get(':id/request-stats')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:view')
  @ApiOperation({ summary: 'Estadísticas de solicitudes y tickets de un usuario.' })
  getUserRequestStats(@Param('id', ParseUUIDPipe) id: string) {
    return this.profileService.getUserRequestStats(id);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:view')
  @ApiOperation({ summary: 'Ver usuario por ID.' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.getUser(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:edit')
  @ApiOperation({ summary: 'Actualizar usuario.' })
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateUser(req.user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @RequirePermission('global:users:delete')
  @ApiOperation({ summary: 'Soft-delete usuario. Solo superadmin.' })
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.usersService.deleteUser(req.user.sub, id);
  }

  // ─── Roles por módulo ────────────────────────────────────────────────────────

  @Get(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:view')
  @ApiOperation({ summary: 'Roles de un usuario en todos sus módulos.' })
  getRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.roleService.getUserRoles(id);
  }

  @Post(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:assign_role')
  @ApiOperation({ summary: 'Asignar rol a usuario en un módulo.' })
  assignRole(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRoleDto) {
    return this.roleService.assignRole(req.user.sub, id, dto);
  }

  @Delete(':id/roles/:umrId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:assign_role')
  @ApiOperation({ summary: 'Quitar rol de usuario.' })
  removeRole(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('umrId', ParseUUIDPipe) umrId: string) {
    return this.roleService.removeRole(req.user.sub, id, umrId);
  }

  // ─── Disponibilidad ──────────────────────────────────────────────────────────

  @Get(':id/availability')
  @ApiOperation({ summary: 'Disponibilidad del técnico por módulo.' })
  getAvailability(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillService.getAvailability(id);
  }

  @Put(':id/availability')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:edit')
  @ApiOperation({ summary: 'Setear disponibilidad / incapacidad del técnico.' })
  setAvailability(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AvailabilityDto) {
    return this.skillService.setAvailability(req.user.sub, id, dto);
  }

  // ─── Skills ──────────────────────────────────────────────────────────────────

  @Get(':id/skills')
  @ApiOperation({ summary: 'Habilidades del técnico.' })
  getSkills(@Param('id', ParseUUIDPipe) id: string) {
    return this.skillService.getSkills(id);
  }

  @Post(':id/skills')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:edit')
  @ApiOperation({ summary: 'Agregar habilidad al técnico.' })
  addSkill(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSkillDto) {
    return this.skillService.addSkill(req.user.sub, id, dto);
  }

  @Patch(':id/skills/:skillId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:edit')
  @ApiOperation({ summary: 'Editar habilidad (max_concurrent, priority).' })
  updateSkill(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.skillService.updateSkill(req.user.sub, id, skillId, dto);
  }

  @Delete(':id/skills/:skillId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @RequirePermission('global:users:edit')
  @ApiOperation({ summary: 'Desactivar habilidad del técnico.' })
  removeSkill(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('skillId', ParseUUIDPipe) skillId: string) {
    return this.skillService.removeSkill(req.user.sub, id, skillId);
  }
}
