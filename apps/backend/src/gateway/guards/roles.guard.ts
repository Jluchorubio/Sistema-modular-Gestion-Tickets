import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required: string[] = this.reflector.getAllAndOverride(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub) throw new ForbiddenException();

    const [profile] = await this.db.query<{ is_superadmin: boolean }[]>(
      `SELECT is_superadmin FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [user.sub],
    );

    if (!profile) throw new ForbiddenException();

    // superadmin siempre pasa
    if (profile.is_superadmin) return true;

    // si solo se requiere superadmin, denegar
    if (!required.includes('admin_modulo')) throw new ForbiddenException();

    // verificar que tiene al menos un rol admin_modulo activo en algún módulo
    const [adminRole] = await this.db.query<{ id: string }[]>(
      `SELECT umr.id
       FROM   modules.user_module_roles umr
       JOIN   modules.module_roles      mr ON mr.id = umr.role_id
       WHERE  umr.user_id  = $1
         AND  mr.name      = 'admin_modulo'
         AND  umr.is_active = true
       LIMIT 1`,
      [user.sub],
    );

    if (!adminRole) throw new ForbiddenException();

    return true;
  }
}
