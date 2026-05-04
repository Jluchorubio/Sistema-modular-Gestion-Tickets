import { Injectable, UnauthorizedException, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }

  handleRequest(err: any, user: any) {
    if (err || !user) throw err ?? new UnauthorizedException();
    // Bloquear tokens de challenge MFA/OTP — no son sesiones completas
    if (user.mfa_pending || user.otp_pending) {
      throw new UnauthorizedException('Verificación MFA pendiente');
    }
    return user;
  }
}
