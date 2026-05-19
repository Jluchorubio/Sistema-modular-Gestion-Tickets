import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { PermissionsService } from '../../modules/permissions/permissions.service';

export const PERMISSION_KEY = 'permission';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const request = context.switchToHttp().getRequest();

    // req.user is set by JwtAuthGuard (controller guard) which runs after global APP_GUARDs.
    // If it's not yet set, extract the user ID directly from the Authorization header so
    // the permission check works regardless of guard execution order.
    const userId: string | undefined =
      request.user?.sub ?? this.extractUserIdFromToken(request);

    // No valid identity — let JwtAuthGuard produce the proper 401
    if (!userId) return true;

    const has = await this.permissionsService.hasPermission(userId, required);
    if (!has) throw new ForbiddenException(`Permiso requerido: ${required}`);

    return true;
  }

  private extractUserIdFromToken(request: any): string | undefined {
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) return undefined;
    try {
      const token   = authHeader.slice(7);
      const secret  = this.config.get<string>('JWT_SECRET')!;
      const payload = jwt.verify(token, secret) as Record<string, unknown>;
      return typeof payload?.sub === 'string' ? payload.sub : undefined;
    } catch {
      return undefined;
    }
  }
}
