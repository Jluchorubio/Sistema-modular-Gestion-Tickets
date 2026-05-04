import {
  Controller,
  Post,
  Get,
  Body,
  Headers,
  Query,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { VerifyTotpDto } from './dto/verify-totp.dto';
import { RefreshDto } from './dto/refresh.dto';
import { JwtAuthGuard } from '../../gateway/guards/jwt-auth.guard';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Login con email/password. Retorna token o inicia flujo MFA.' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  @Post('mfa/verify')
  @ApiOperation({ summary: 'Verificar código TOTP (Google Authenticator). Requiere mfa_token en header.' })
  verifyMfa(
    @Body() dto: VerifyTotpDto,
    @Headers('authorization') auth: string,
  ) {
    const token = auth?.replace('Bearer ', '').trim();
    if (!token) throw new UnauthorizedException('mfa_token requerido en Authorization header');
    return this.authService.verifyMfa(dto.factor_id, dto.code, token);
  }

  @Get('google')
  @ApiOperation({ summary: 'Obtener URL de OAuth de Google. Redirige el browser a esta URL.' })
  getGoogleUrl(@Query('redirect_to') redirectTo?: string) {
    return this.authService.getGoogleOAuthUrl(redirectTo);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Renovar access_token usando refresh_token.' })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refreshSession(dto.refresh_token);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Info del usuario autenticado.' })
  getMe(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '').trim();
    return this.authService.getMe(token);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post('logout')
  @ApiOperation({ summary: 'Invalidar sesión actual.' })
  logout(@Headers('authorization') auth: string) {
    const token = auth?.replace('Bearer ', '').trim();
    return this.authService.logout(token);
  }
}
