import {
  Controller, Get, Patch, Post, Param, Body, Req, UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';
import { RolesGuard } from '../../gateway/guards/roles.guard';
import { Roles } from '../../gateway/decorators/roles.decorator';
import { PermissionsService } from './permissions.service';

@ApiTags('permissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('permissions')
export class PermissionsController {
  constructor(private readonly svc: PermissionsService) {}

  /* ── Usuario actual ────────────────────────────────────────────── */

  @Get('mine')
  @ApiOperation({ summary: 'Permisos del usuario autenticado (array de keys)' })
  async getMyPermissions(@Req() req: any) {
    const perms = await this.svc.getUserPermissions(req.user.sub);
    return Array.from(perms);
  }

  /* ── Árbol de permisos ─────────────────────────────────────────── */

  @Get('tree')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Árbol completo de permisos del sistema' })
  getTree() { return this.svc.getPermissionTree(); }

  /* ── Módulos con scopes ────────────────────────────────────────── */

  @Get('modules')
  @UseGuards(RolesGuard) @Roles('superadmin')
  getModulesWithScopes() { return this.svc.getModulesWithScopes(); }

  /* ── Roles globales ────────────────────────────────────────────── */

  @Get('roles/global')
  @UseGuards(RolesGuard) @Roles('superadmin')
  getGlobalRoles() { return this.svc.getGlobalRoles(); }

  @Get('roles/global/:roleId/grants')
  @UseGuards(RolesGuard) @Roles('superadmin')
  getGlobalGrants(@Param('roleId') roleId: string) {
    return this.svc.getGrantsForRole(roleId, 'global');
  }

  /* ── Roles de módulo ───────────────────────────────────────────── */

  @Get('roles/module/:moduleId')
  @UseGuards(RolesGuard) @Roles('superadmin')
  getModuleRoles(@Param('moduleId') moduleId: string) {
    return this.svc.getModuleRoles(moduleId);
  }

  @Get('roles/module-role/:roleId/grants')
  @UseGuards(RolesGuard) @Roles('superadmin')
  getModuleRoleGrants(@Param('roleId') roleId: string) {
    return this.svc.getGrantsForRole(roleId, 'module');
  }

  /* ── Mutaciones ────────────────────────────────────────────────── */

  @Patch('roles/:roleId/grant')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Activar/desactivar un permiso en un rol' })
  toggleGrant(
    @Param('roleId') roleId: string,
    @Body() body: { permission_key: string; granted: boolean; role_type: 'global' | 'module' },
  ) {
    return this.svc.toggleGrant(roleId, body.role_type, body.permission_key, body.granted);
  }

  @Post('roles/:roleId/grant-children')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Activar todos los hijos de un permiso padre' })
  grantChildren(
    @Param('roleId') roleId: string,
    @Body() body: { parent_key: string; role_type: 'global' | 'module' },
  ) {
    return this.svc.grantAllChildren(roleId, body.role_type, body.parent_key);
  }

  @Post('roles/:roleId/revoke-children')
  @UseGuards(RolesGuard) @Roles('superadmin')
  @ApiOperation({ summary: 'Revocar todos los hijos de un permiso padre' })
  revokeChildren(
    @Param('roleId') roleId: string,
    @Body() body: { parent_key: string },
  ) {
    return this.svc.revokeAllChildren(roleId, body.parent_key);
  }
}
