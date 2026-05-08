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
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { ProfileCompleteGuard } from '../../gateway/guards/profile-complete.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { SkipProfileCheck } from '../../gateway/decorators/skip-profile-check.decorator';
import { UsersService } from './users.service';
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
  constructor(private readonly service: UsersService) {}

  // ─── CRUD (superadmin / admin_modulo) ────────────────────────────────────────

  @Post()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Crear usuario. Solo superadmin o admin_modulo.' })
  create(@Req() req: any, @Body() dto: CreateUserDto) {
    return this.service.createUser(req.user.sub, dto);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Listar usuarios con filtros y paginación.' })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'is_active', required: false, type: Boolean })
  @ApiQuery({ name: 'is_superadmin', required: false, type: Boolean })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(@Query() query: { search?: string; is_active?: string; is_superadmin?: string; page?: string; limit?: string }) {
    return this.service.listUsers({
      search: query.search,
      is_active: query.is_active !== undefined ? query.is_active === 'true' : undefined,
      is_superadmin: query.is_superadmin !== undefined ? query.is_superadmin === 'true' : undefined,
      page: query.page ? parseInt(query.page, 10) : 1,
      limit: query.limit ? parseInt(query.limit, 10) : 20,
    });
  }

  @Get('me')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Perfil propio completo.' })
  getMe(@Req() req: any) {
    return this.service.getMyProfile(req.user.sub);
  }

  @Patch('me')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Actualizar mi perfil (phone, avatar_url).' })
  updateMe(@Req() req: any, @Body() dto: UpdateUserDto) {
    return this.service.updateMyProfile(req.user.sub, dto);
  }

  @Patch('me/complete-profile')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Completar perfil obligatorio (phone, address, sede, área, cargo). Desbloquea acceso al sistema.' })
  completeProfile(@Req() req: any, @Body() dto: CompleteProfileDto) {
    return this.service.completeMyProfile(req.user.sub, dto);
  }

  @Patch('me/password')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Cambiar contraseña propia.' })
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.service.changePassword(req.user.sub, dto);
  }

  @Get('me/preferences')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Ver preferencias propias.' })
  getPreferences(@Req() req: any) {
    return this.service.getMyPreferences(req.user.sub);
  }

  @Put('me/preferences')
  @SkipProfileCheck()
  @ApiOperation({ summary: 'Actualizar preferencias propias.' })
  upsertPreferences(@Req() req: any, @Body() dto: PreferencesDto) {
    return this.service.upsertMyPreferences(req.user.sub, dto);
  }

  @Get('module/:moduleId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Usuarios activos de un módulo con sus roles.' })
  getUsersByModule(@Param('moduleId', ParseUUIDPipe) moduleId: string) {
    return this.service.getUsersByModule(moduleId);
  }

  // ─── Roles globales ──────────────────────────────────────────────────────────

  @Get('global-roles')
  @ApiOperation({ summary: 'Listar roles globales del sistema.' })
  listGlobalRoles() {
    return this.service.listGlobalRoles();
  }

  @Post('global-roles')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Crear nuevo rol global. Solo superadmin.' })
  createGlobalRole(@Body() body: { name: string; description?: string }) {
    return this.service.createGlobalRole(body.name, body.description);
  }

  @Delete('global-roles/:id')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Desactivar rol global (soft-delete). Solo superadmin.' })
  deleteGlobalRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteGlobalRole(id);
  }

  @Patch('global-roles/:id/reactivate')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Reactivar rol global desactivado. Solo superadmin.' })
  reactivateGlobalRole(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.reactivateGlobalRole(id);
  }

  // ─── Asignación masiva por módulo ────────────────────────────────────────────

  @Post('module/:moduleId/bulk-assign')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Asignar rol a múltiples usuarios en un módulo.' })
  bulkAssign(
    @Req() req: any,
    @Param('moduleId', ParseUUIDPipe) moduleId: string,
    @Body() body: { user_ids: string[]; role_id: string },
  ) {
    return this.service.bulkAssignModuleRole(req.user.sub, body.user_ids, moduleId, body.role_id);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Ver usuario por ID.' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getUser(id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Actualizar usuario.' })
  update(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto) {
    return this.service.updateUser(req.user.sub, id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('superadmin')
  @ApiOperation({ summary: 'Soft-delete usuario. Solo superadmin.' })
  remove(@Req() req: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteUser(req.user.sub, id);
  }

  // ─── Roles por módulo ────────────────────────────────────────────────────────

  @Get(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Roles de un usuario en todos sus módulos.' })
  getRoles(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getUserRoles(id);
  }

  @Post(':id/roles')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Asignar rol a usuario en un módulo.' })
  assignRole(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignRoleDto) {
    return this.service.assignRole(req.user.sub, id, dto);
  }

  @Delete(':id/roles/:umrId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Quitar rol de usuario.' })
  removeRole(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('umrId', ParseUUIDPipe) umrId: string) {
    return this.service.removeRole(req.user.sub, id, umrId);
  }

  // ─── Disponibilidad ──────────────────────────────────────────────────────────

  @Get(':id/availability')
  @ApiOperation({ summary: 'Disponibilidad del técnico por módulo.' })
  getAvailability(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getAvailability(id);
  }

  @Put(':id/availability')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Setear disponibilidad / incapacidad del técnico.' })
  setAvailability(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AvailabilityDto) {
    return this.service.setAvailability(req.user.sub, id, dto);
  }

  // ─── Skills ──────────────────────────────────────────────────────────────────

  @Get(':id/skills')
  @ApiOperation({ summary: 'Habilidades del técnico.' })
  getSkills(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.getSkills(id);
  }

  @Post(':id/skills')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Agregar habilidad al técnico.' })
  addSkill(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Body() dto: AddSkillDto) {
    return this.service.addSkill(req.user.sub, id, dto);
  }

  @Patch(':id/skills/:skillId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Editar habilidad (max_concurrent, priority).' })
  updateSkill(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('skillId', ParseUUIDPipe) skillId: string,
    @Body() dto: UpdateSkillDto,
  ) {
    return this.service.updateSkill(req.user.sub, id, skillId, dto);
  }

  @Delete(':id/skills/:skillId')
  @UseGuards(RolesGuard)
  @Roles('superadmin', 'admin_modulo')
  @ApiOperation({ summary: 'Desactivar habilidad del técnico.' })
  removeSkill(@Req() req: any, @Param('id', ParseUUIDPipe) id: string, @Param('skillId', ParseUUIDPipe) skillId: string) {
    return this.service.removeSkill(req.user.sub, id, skillId);
  }
}
