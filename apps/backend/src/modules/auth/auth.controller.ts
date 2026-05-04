import {
  Controller,
  Post,
  Get,
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
import { VerifyTotpDto } from './dto/verify-totp.dto';
import { MfaEnableDto } from './dto/mfa-setup.dto';
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
  @ApiOperation({ summary: 'Login. Retorna tokens o { requires_mfa, mfa_token } si 2FA activo.' })
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
  @ApiOperation({ summary: 'Usuario autenticado + estado MFA.' })
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
    const result = await this.authService.loginWithGoogle(req.user);
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    // Redirigir a modules-test.html con tokens en hash (evita logs de servidor)
    return res.redirect(
      `${appUrl}/modules-test.html` +
      `#access_token=${result.access_token}` +
      `&refresh_token=${result.refresh_token}` +
      `&name=${encodeURIComponent(result.user.name)}`,
    );
  }

  // ─── MFA (TOTP) ──────────────────────────────────────────────────────────────

  @Post('mfa/verify')
  @ApiOperation({ summary: 'Verificar código TOTP durante login. Requiere mfa_token en Authorization.' })
  verifyMfa(
    @Body() dto: VerifyTotpDto,
    @Headers('authorization') auth: string,
  ) {
    const token = auth?.replace('Bearer ', '').trim();
    if (!token) throw new UnauthorizedException('mfa_token requerido en Authorization header');
    return this.authService.verifyMfa(token, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('mfa/setup')
  @ApiOperation({ summary: 'Generar QR para enrolar Google Authenticator.' })
  setupMfa(@Req() req: any) {
    return this.authService.setupMfa(req.user.sub, req.user.email);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('mfa/enable')
  @ApiOperation({ summary: 'Confirmar enrolamiento MFA con primer código TOTP.' })
  enableMfa(@Req() req: any, @Body() dto: MfaEnableDto) {
    return this.authService.enableMfa(req.user.sub, dto.code);
  }

  // ─── Email OTP ───────────────────────────────────────────────────────────────

  @Post('otp/verify')
  @ApiOperation({ summary: 'Verificar código OTP recibido por email. Requiere otp_token en Authorization.' })
  verifyEmailOtp(
    @Body() dto: VerifyEmailOtpDto,
    @Headers('authorization') auth: string,
  ) {
    const token = auth?.replace('Bearer ', '').trim();
    if (!token) throw new UnauthorizedException('otp_token requerido en Authorization header');
    return this.authService.verifyEmailOtp(token, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('otp/enable')
  @ApiOperation({ summary: 'Habilitar 2FA por email OTP para el usuario autenticado.' })
  enableEmailOtp(@Req() req: any) {
    return this.authService.enableEmailOtp(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('otp/disable')
  @ApiOperation({ summary: 'Deshabilitar 2FA por email OTP.' })
  disableEmailOtp(@Req() req: any) {
    return this.authService.disableEmailOtp(req.user.sub);
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
}
