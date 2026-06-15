import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { Reflector } from '@nestjs/core';

const ALLOWED_PATHS = [
  '/auth/password/change',
  '/auth/password/reset',
  '/auth/password/setup',
  '/auth/logout',
  '/auth/me',
  '/auth/refresh',
];

@Injectable()
export class PasswordExpiryGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectDataSource() private readonly db: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const userId: string | undefined = request.user?.sub;

    // No userId means either public route or JwtAuthGuard hasn't run yet — skip
    if (!userId) return true;

    // Always allow password-change and auth utility endpoints
    const path: string = request.path ?? '';
    if (ALLOWED_PATHS.some((p) => path.includes(p))) return true;

    // Check whether the user's password is expired via DB
    let passwordExpired = false;
    try {
      const [cred] = await this.db.query<{
        password_changed_at: string | null;
      }[]>(
        `SELECT password_changed_at FROM auth.credentials WHERE user_id = $1`,
        [userId],
      );

      if (cred?.password_changed_at) {
        const [org] = await this.db.query<{ password_policy: any }[]>(
          `SELECT password_policy FROM users.organizations WHERE id = '00000000-0000-0000-0000-000000000001'`,
        );
        const expiryDays: number | undefined =
          org?.password_policy?.expiry_days;
        if (expiryDays && expiryDays > 0) {
          const changedMs = new Date(cred.password_changed_at).getTime();
          const expiresMs = changedMs + expiryDays * 24 * 60 * 60 * 1000;
          passwordExpired = Date.now() > expiresMs;
        }
      }
    } catch {
      // Non-critical — never block login flow on error
      return true;
    }

    if (passwordExpired) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'PASSWORD_EXPIRED',
        message:
          'Tu contraseña ha expirado. Debes cambiarla para continuar.',
      });
    }

    return true;
  }
}
