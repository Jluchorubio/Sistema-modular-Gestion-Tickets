import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SKIP_PROFILE_CHECK_KEY } from '../decorators/skip-profile-check.decorator';

@Injectable()
export class ProfileCompleteGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_PROFILE_CHECK_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.sub) return true;

    const [profile] = await this.db.query<{ profile_complete: boolean; is_superadmin: boolean }[]>(
      `SELECT profile_complete, is_superadmin
       FROM   users.profiles
       WHERE  id = $1 AND deleted_at IS NULL`,
      [user.sub],
    );

    if (!profile || profile.is_superadmin) return true;

    if (!profile.profile_complete) {
      throw new ForbiddenException({
        message: 'Debes completar tu perfil antes de acceder al sistema.',
        code: 'PROFILE_INCOMPLETE',
        redirect: '/profile-complete.html',
      });
    }

    return true;
  }
}
