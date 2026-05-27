import {
  Injectable, CanActivate, ExecutionContext,
  ForbiddenException, UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';

export interface CriticalAuditMeta {
  userId:       string;
  reason:       string;
  verified_2fa: boolean;
  ip:           string | null;
  userAgent:    string | null;
}

declare module 'express' {
  interface Request {
    criticalAudit?: CriticalAuditMeta;
  }
}

@Injectable()
export class CriticalChangeGuard implements CanActivate {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();

    const raw = req.headers['x-critical-auth'] as string | undefined;
    if (!raw) throw new ForbiddenException('Se requiere autenticación crítica (X-Critical-Auth)');

    let payload: { password?: string; totp_code?: string; reason?: string };
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new ForbiddenException('X-Critical-Auth header malformado');
    }

    const { password, totp_code, reason } = payload;
    if (!password)                         throw new ForbiddenException('Contraseña requerida');
    if (!reason || reason.trim().length < 20)
      throw new ForbiddenException('Razón requerida (mínimo 20 caracteres)');

    const userId = req.user?.id;
    if (!userId) throw new UnauthorizedException();

    const [cred] = await this.db.query<{
      password_hash: string;
      totp_secret:   string | null;
      totp_enabled:  boolean;
    }[]>(
      `SELECT c.password_hash,
              COALESCE(m.totp_secret,  NULL)  AS totp_secret,
              COALESCE(m.totp_enabled, false) AS totp_enabled
       FROM auth.credentials c
       LEFT JOIN auth.mfa_settings m ON m.user_id = c.user_id
       WHERE c.user_id = $1`,
      [userId],
    );

    if (!cred) throw new UnauthorizedException('Credenciales no encontradas');

    const passwordOk = await bcrypt.compare(password, cred.password_hash);
    if (!passwordOk) throw new ForbiddenException('Contraseña incorrecta');

    let verified_2fa = false;
    if (cred.totp_enabled && cred.totp_secret) {
      if (!totp_code) throw new ForbiddenException('Código TOTP requerido para esta cuenta');
      const totpOk = speakeasy.totp.verify({
        secret:   cred.totp_secret,
        encoding: 'base32',
        token:    totp_code,
        window:   1,
      });
      if (!totpOk) throw new ForbiddenException('Código TOTP inválido o expirado');
      verified_2fa = true;
    }

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
      ?? req.socket?.remoteAddress
      ?? null;

    req.criticalAudit = {
      userId,
      reason: reason.trim(),
      verified_2fa,
      ip,
      userAgent: req.headers['user-agent'] ?? null,
    };

    return true;
  }
}
