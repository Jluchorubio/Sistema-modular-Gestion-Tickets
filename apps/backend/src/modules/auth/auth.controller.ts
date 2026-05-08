import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Req,
  Res,
  Headers,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyEmailOtpDto } from './dto/email-otp.dto';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  // ─── Email/password ──────────────────────────────────────────────────────────

  @Post('login')
  @ApiOperation({ summary: 'Login. Retorna { requires_mfa, mfa_type, otp_token } para verificación por email.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Rotar access_token con refresh_token.' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshSession(dto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Usuario autenticado.' })
  getMe(@Req() req: any) {
    return this.authService.getMe(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Cerrar sesión y revocar refresh_token.' })
  logout(@Req() req: any, @Body() dto: LogoutDto) {
    return this.authService.logout(req.user.sub, dto.refresh_token);
  }

  // ─── Google OAuth ────────────────────────────────────────────────────────────

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Redirige a Google para OAuth. Abrir en browser.' })
  googleAuth() {
    // Passport redirige automáticamente
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleCallback(@Req() req: any, @Res() res: Response) {
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    try {
      const result = await this.authService.loginWithGoogle(req.user);
      return res.redirect(
        `${appUrl}/modules-test.html` +
        `#access_token=${result.access_token}` +
        `&refresh_token=${result.refresh_token}` +
        `&name=${encodeURIComponent(result.user.name)}`,
      );
    } catch (err) {
      const message = encodeURIComponent(err.message ?? 'Error de autenticación');
      return res.redirect(`${appUrl}/test-auth.html?error=${message}`);
    }
  }

  // ─── Email OTP ───────────────────────────────────────────────────────────────

  @Post('otp/verify')
  @ApiOperation({ summary: 'Verificar código OTP. Requiere otp_token en Authorization.' })
  verifyEmailOtp(
    @Body() dto: VerifyEmailOtpDto,
    @Headers('authorization') auth: string,
  ) {
    const token = auth?.replace('Bearer ', '').trim();
    if (!token) throw new UnauthorizedException('otp_token requerido en Authorization header');
    return this.authService.verifyEmailOtp(token, dto.code);
  }

  @Post('otp/resend')
  @ApiOperation({ summary: 'Reenviar código OTP por email. Requiere otp_token en Authorization.' })
  resendEmailOtp(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '').trim();
    if (!token) throw new UnauthorizedException('otp_token requerido en Authorization header');
    return this.authService.resendOtp(token);
  }

  // ─── Password recovery ───────────────────────────────────────────────────────

  @Post('password/forgot')
  @ApiOperation({ summary: 'Enviar email con link de recuperación de contraseña.' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('password/reset')
  @ApiOperation({ summary: 'Resetear contraseña con token recibido por email.' })
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.new_password);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('verify-credentials')
  @ApiOperation({ summary: 'Verificar contraseña del usuario autenticado sin generar sesión.' })
  async verifyCredentials(@Req() req: any, @Body() body: { password: string }) {
    const valid = await this.authService.verifyCredentials(req.user.sub, body.password);
    if (!valid) throw new UnauthorizedException('Contraseña incorrecta');
    return { ok: true };
  }

  // ─── TOTP 2FA ────────────────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('totp/setup')
  @ApiOperation({ summary: 'Generar secret TOTP y QR code para configurar authenticator app.' })
  setupTotp(@Req() req: any) {
    return this.authService.setupTotp(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('totp/confirm')
  @ApiOperation({ summary: 'Confirmar TOTP con primer código del authenticator para activarlo.' })
  confirmTotp(@Req() req: any, @Body() body: { code: string }) {
    return this.authService.confirmTotp(req.user.sub, body.code);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Delete('totp/disable')
  @ApiOperation({ summary: 'Desactivar TOTP verificando con código actual del authenticator.' })
  disableTotp(@Req() req: any, @Body() body: { code: string }) {
    return this.authService.disableTotp(req.user.sub, body.code);
  }
}
