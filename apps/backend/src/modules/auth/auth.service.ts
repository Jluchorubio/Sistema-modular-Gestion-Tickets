import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { createHash, randomBytes } from 'crypto';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import * as http from 'http';

const OTP_EXPIRY_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 3;
const MAX_LOGIN_ATTEMPTS = 3;
const LOCKOUT_MINUTES = 15;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Login email/password ────────────────────────────────────────────────────

  async login(email: string, password: string, ip?: string, userAgent?: string) {
    const identifier = email.toLowerCase().trim();
    const rows = await this.db.query<any[]>(
      `SELECT c.id                    AS cred_id,
              c.user_id,
              c.email,
              c.password_hash,
              c.is_active,
              c.login_locked_until,
              c.failed_login_attempts,
              p.first_name,
              p.last_name,
              p.is_superadmin
       FROM   auth.credentials c
       JOIN   users.profiles   p ON p.id = c.user_id
       WHERE  (c.email = $1 OR LOWER(p.username) = $1) AND p.deleted_at IS NULL`,
      [identifier],
    );

    const cred = rows[0];
    if (!cred || !cred.is_active) throw new UnauthorizedException('Credenciales inválidas');

    // Check account lockout
    if (cred.login_locked_until && new Date(cred.login_locked_until) > new Date()) {
      const secsRemaining = Math.ceil((new Date(cred.login_locked_until).getTime() - Date.now()) / 1000);
      throw new HttpException(
        {
          message: `Cuenta bloqueada temporalmente. Intenta en ${secsRemaining} segundos.`,
          locked_until: cred.login_locked_until,
          seconds_remaining: secsRemaining,
          locked: true,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    if (cred.password_hash.startsWith('!')) {
      throw new UnauthorizedException('Cuenta OAuth — usa "Continuar con Google"');
    }

    const valid = await bcrypt.compare(password, cred.password_hash);
    if (!valid) {
      const newAttempts = (cred.failed_login_attempts ?? 0) + 1;
      if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
        await this.db.query(
          `UPDATE auth.credentials
           SET failed_login_attempts = 0,
               login_locked_until    = now() + INTERVAL '${LOCKOUT_MINUTES} minutes'
           WHERE id = $1`,
          [cred.cred_id],
        );
        throw new HttpException(
          {
            message: `Demasiados intentos fallidos. Cuenta bloqueada ${LOCKOUT_MINUTES} minutos.`,
            locked: true,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      await this.db.query(
        `UPDATE auth.credentials SET failed_login_attempts = $1 WHERE id = $2`,
        [newAttempts, cred.cred_id],
      );
      throw new HttpException(
        {
          message: 'Contraseña incorrecta.',
          attempts_remaining: MAX_LOGIN_ATTEMPTS - newAttempts,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    await this.db.query(
      `UPDATE auth.credentials SET last_login_at = now(), failed_login_attempts = 0 WHERE id = $1`,
      [cred.cred_id],
    );

    // Check if OTP is enabled for this user (default true for safety)
    let otpEnabled = true;
    try {
      const [otpRow] = await this.db.query<{ otp_enabled: boolean }[]>(
        `SELECT COALESCE(otp_enabled, true) AS otp_enabled FROM auth.credentials WHERE id = $1`,
        [cred.cred_id],
      );
      otpEnabled = otpRow?.otp_enabled ?? true;
    } catch {
      otpEnabled = true;
    }

    if (otpEnabled) {
      await this.sendEmailOtp(cred.user_id, cred.email);
      return {
        requires_mfa: true,
        mfa_type: 'email_otp',
        otp_token: this.jwt.sign(
          { sub: cred.user_id, email: cred.email, otp_pending: true },
          { expiresIn: `${OTP_EXPIRY_MINUTES}m` },
        ),
      };
    }

    return this.buildSession(cred.user_id, cred.email, cred.first_name, cred.last_name, cred.is_superadmin, ip, userAgent);
  }

  // ─── Google OAuth ────────────────────────────────────────────────────────────

  async loginWithGoogle(profile: { email: string; firstName: string; lastName: string; avatar: string | null }, ip?: string, userAgent?: string) {
    const rows = await this.db.query<any[]>(
      `SELECT c.user_id, c.email, p.first_name, p.last_name, p.is_superadmin
       FROM auth.credentials c
       JOIN users.profiles p ON p.id = c.user_id
       WHERE c.email = $1 AND p.deleted_at IS NULL AND c.is_active = true`,
      [profile.email.toLowerCase()],
    );

    if (!rows[0]) {
      throw new UnauthorizedException('No tienes una cuenta registrada. Contacta al administrador.');
    }

    const user = rows[0];
    return this.buildSession(user.user_id, user.email, user.first_name, user.last_name, user.is_superadmin, ip, userAgent);
  }

  // ─── Email OTP: verificar ────────────────────────────────────────────────────

  async verifyEmailOtp(otpToken: string, code: string, ip?: string, userAgent?: string) {
    let payload: any;
    try { payload = this.jwt.verify(otpToken); }
    catch { throw new UnauthorizedException('otp_token inválido o expirado'); }
    if (!payload.otp_pending) throw new UnauthorizedException('Token no es de OTP');

    // Check lockout
    const [credCheck] = await this.db.query<any[]>(
      `SELECT login_locked_until FROM auth.credentials WHERE user_id = $1`,
      [payload.sub],
    );
    if (credCheck?.login_locked_until && new Date(credCheck.login_locked_until) > new Date()) {
      const secsRemaining = Math.ceil((new Date(credCheck.login_locked_until).getTime() - Date.now()) / 1000);
      throw new HttpException(
        {
          message: `Cuenta bloqueada. Intenta en ${secsRemaining}s.`,
          locked_until: credCheck.login_locked_until,
          seconds_remaining: secsRemaining,
          locked: true,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Find active OTP (latest, not expired, not used)
    const [otp] = await this.db.query<any[]>(
      `SELECT id, code_hash, attempts FROM auth.email_otp
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1`,
      [payload.sub],
    );

    if (!otp) {
      throw new UnauthorizedException('Código expirado. Solicita uno nuevo.');
    }

    const codeHash = this.hash(code);
    if (otp.code_hash !== codeHash) {
      const newAttempts = (otp.attempts ?? 0) + 1;

      if (newAttempts >= MAX_OTP_ATTEMPTS) {
        await this.db.query(
          `UPDATE auth.email_otp SET used_at = now(), attempts = $2 WHERE id = $1`,
          [otp.id, newAttempts],
        );
        await this.db.query(
          `UPDATE auth.credentials SET login_locked_until = now() + INTERVAL '${LOCKOUT_MINUTES} minutes'
           WHERE user_id = $1`,
          [payload.sub],
        );
        throw new HttpException(
          {
            message: `Demasiados intentos fallidos. Cuenta bloqueada ${LOCKOUT_MINUTES} minutos.`,
            attempts_remaining: 0,
            locked: true,
          },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }

      await this.db.query(
        `UPDATE auth.email_otp SET attempts = $2 WHERE id = $1`,
        [otp.id, newAttempts],
      );
      throw new HttpException(
        {
          message: 'Código incorrecto.',
          attempts_remaining: MAX_OTP_ATTEMPTS - newAttempts,
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    // Valid — mark OTP used, clear lockout, build session
    await this.db.query(`UPDATE auth.email_otp SET used_at = now() WHERE id = $1`, [otp.id]);
    await this.db.query(
      `UPDATE auth.credentials SET login_locked_until = NULL WHERE user_id = $1`,
      [payload.sub],
    );

    const [user] = await this.db.query<any[]>(
      `SELECT p.first_name, p.last_name, p.is_superadmin, c.email
       FROM users.profiles p JOIN auth.credentials c ON c.user_id = p.id
       WHERE p.id = $1`,
      [payload.sub],
    );
    return this.buildSession(payload.sub, user.email, user.first_name, user.last_name, user.is_superadmin, ip, userAgent);
  }

  // ─── Email OTP: reenviar ─────────────────────────────────────────────────────

  async resendOtp(otpToken: string) {
    let payload: any;
    try { payload = this.jwt.verify(otpToken); }
    catch { throw new UnauthorizedException('otp_token inválido o expirado'); }
    if (!payload.otp_pending) throw new UnauthorizedException('Token no es de OTP');

    // Check lockout
    const [cred] = await this.db.query<any[]>(
      `SELECT login_locked_until FROM auth.credentials WHERE user_id = $1`,
      [payload.sub],
    );
    if (cred?.login_locked_until && new Date(cred.login_locked_until) > new Date()) {
      const secsRemaining = Math.ceil((new Date(cred.login_locked_until).getTime() - Date.now()) / 1000);
      throw new HttpException(
        { message: `Cuenta bloqueada. Intenta en ${secsRemaining}s.`, seconds_remaining: secsRemaining },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.sendEmailOtp(payload.sub, payload.email);
    const newOtpToken = this.jwt.sign(
      { sub: payload.sub, email: payload.email, otp_pending: true },
      { expiresIn: `${OTP_EXPIRY_MINUTES}m` },
    );
    return { ok: true, otp_token: newOtpToken };
  }

  // ─── Password recovery ───────────────────────────────────────────────────────

  async forgotPassword(email: string) {
    const rows = await this.db.query<any[]>(
      `SELECT c.user_id, p.first_name
       FROM auth.credentials c
       JOIN users.profiles p ON p.id = c.user_id
       WHERE c.email = $1 AND c.is_active = true AND p.deleted_at IS NULL`,
      [email.toLowerCase().trim()],
    );

    if (!rows[0]) return { ok: true };

    const { user_id, first_name } = rows[0];
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hash(rawToken);

    await this.db.query(
      `INSERT INTO auth.password_resets (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '1 hour')`,
      [user_id, tokenHash],
    );

    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const resetLink = `${appUrl}/login?reset_token=${rawToken}`;

    await this.sendEmail(
      email,
      'Recuperación de contraseña — Tickets System',
      `<p>Hola ${first_name},</p>
       <p>Haz clic para resetear tu contraseña (válido 1 hora):</p>
       <p><a href="${resetLink}">${resetLink}</a></p>
       <p>Si no lo solicitaste, ignora este correo.</p>`,
    );

    return { ok: true };
  }

  async resetPassword(token: string, newPassword: string) {
    const tokenHash = this.hash(token);
    const rows = await this.db.query<any[]>(
      `SELECT id, user_id FROM auth.password_resets
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    if (!rows[0]) throw new BadRequestException('Token inválido o expirado');

    const hash = await bcrypt.hash(newPassword, 10);
    await this.db.query(
      `UPDATE auth.credentials SET password_hash = $1 WHERE user_id = $2`,
      [hash, rows[0].user_id],
    );
    await this.db.query(
      `UPDATE auth.password_resets SET used_at = now() WHERE id = $1`,
      [rows[0].id],
    );
    await this.db.query(
      `UPDATE auth.refresh_tokens SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [rows[0].user_id],
    );

    return { ok: true, message: 'Contraseña actualizada' };
  }

  // ─── Session management ──────────────────────────────────────────────────────

  async refreshSession(refreshToken: string) {
    let payload: any;
    try { payload = this.jwt.verify(refreshToken); }
    catch { throw new UnauthorizedException('Refresh token inválido o expirado'); }

    const tokenHash = this.hash(refreshToken);
    const rows = await this.db.query<any[]>(
      `SELECT id FROM auth.refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    if (!rows[0]) throw new UnauthorizedException('Refresh token revocado o expirado');

    await this.db.query(
      `UPDATE auth.refresh_tokens SET revoked_at = now() WHERE token_hash = $1`,
      [tokenHash],
    );

    const access_token  = this.jwt.sign({ sub: payload.sub, email: payload.email }, { expiresIn: '15m' });
    const refresh_token = this.jwt.sign({ sub: payload.sub, email: payload.email }, { expiresIn: '7d' });

    await this.db.query(
      `INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '7 days')`,
      [payload.sub, this.hash(refresh_token)],
    );

    return { access_token, refresh_token };
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.db.query(
        `UPDATE auth.refresh_tokens SET revoked_at = now() WHERE token_hash = $1`,
        [this.hash(refreshToken)],
      );
    }
    await this.db.query(
      `UPDATE auth.sessions SET ended_at = now()
       WHERE user_id = $1 AND ended_at IS NULL`,
      [userId],
    );
    return { ok: true };
  }

  async getMe(userId: string) {
    const rows = await this.db.query<any[]>(
      `SELECT p.id, p.first_name, p.last_name, p.avatar_url,
              p.username, p.is_superadmin, p.profile_complete, c.email, c.last_login_at
       FROM   users.profiles   p
       JOIN   auth.credentials c ON c.user_id = p.id
       WHERE  p.id = $1 AND p.deleted_at IS NULL`,
      [userId],
    );
    if (!rows[0]) throw new UnauthorizedException();
    const u = rows[0];
    return {
      id:               u.id,
      email:            u.email,
      name:             `${u.first_name} ${u.last_name}`.trim(),
      username:         u.username,
      avatar_url:       u.avatar_url,
      is_superadmin:    u.is_superadmin,
      profile_complete: u.profile_complete,
      mfa_enabled:      true,
      last_login_at:    u.last_login_at,
    };
  }

  async setOtpEnabled(userId: string, enabled: boolean) {
    try {
      await this.db.query(
        `UPDATE auth.credentials SET otp_enabled = $1 WHERE user_id = $2`,
        [enabled, userId],
      );
    } catch {
      // Column may not exist yet — migration pending
    }
    return { ok: true, otp_enabled: enabled };
  }

  // ─── TOTP (Google Authenticator) ─────────────────────────────────────────────

  async setupTotp(userId: string): Promise<{ qr: string; secret: string }> {
    const [cred] = await this.db.query<{ email: string }[]>(
      `SELECT email FROM auth.credentials WHERE user_id = $1`,
      [userId],
    );

    const secret = speakeasy.generateSecret({
      name:   `Ticket System (${cred?.email ?? userId})`,
      length: 20,
    });

    await this.db.query(
      `INSERT INTO auth.mfa_settings (user_id, totp_secret, totp_enabled)
       VALUES ($1, $2, false)
       ON CONFLICT (user_id) DO UPDATE SET totp_secret = EXCLUDED.totp_secret, updated_at = now()`,
      [userId, secret.base32],
    );

    const qr = await QRCode.toDataURL(secret.otpauth_url!);
    return { qr, secret: secret.base32 };
  }

  async enableTotp(userId: string, code: string): Promise<{ ok: boolean; totp_enabled: boolean }> {
    const [row] = await this.db.query<{ totp_secret: string }[]>(
      `SELECT totp_secret FROM auth.mfa_settings WHERE user_id = $1`,
      [userId],
    );

    if (!row?.totp_secret) throw new BadRequestException('Escanea el QR primero.');

    const valid = speakeasy.totp.verify({
      secret:   row.totp_secret,
      encoding: 'base32',
      token:    code.replace(/\s/g, ''),
      window:   2,
    });

    if (!valid) throw new UnauthorizedException('Código incorrecto o expirado');

    await this.db.query(
      `UPDATE auth.mfa_settings
       SET totp_enabled = true, totp_last_verified_at = now(), updated_at = now()
       WHERE user_id = $1`,
      [userId],
    );

    return { ok: true, totp_enabled: true };
  }

  async disableTotp(userId: string, code: string): Promise<{ ok: boolean; totp_enabled: boolean }> {
    const [row] = await this.db.query<{ totp_secret: string; totp_enabled: boolean }[]>(
      `SELECT totp_secret, totp_enabled FROM auth.mfa_settings WHERE user_id = $1`,
      [userId],
    );

    if (!row?.totp_enabled) throw new BadRequestException('TOTP no está activo');

    const valid = speakeasy.totp.verify({
      secret:   row.totp_secret,
      encoding: 'base32',
      token:    code.replace(/\s/g, ''),
      window:   2,
    });

    if (!valid) throw new UnauthorizedException('Código incorrecto o expirado');

    await this.db.query(
      `UPDATE auth.mfa_settings
       SET totp_enabled = false, totp_secret = NULL, updated_at = now()
       WHERE user_id = $1`,
      [userId],
    );

    return { ok: true, totp_enabled: false };
  }

  async setupPassword(userId: string, newPassword: string) {
    let credRow: { password_hash: string } | undefined;
    try {
      const [row] = await this.db.query<{ password_hash: string }[]>(
        `SELECT password_hash FROM auth.credentials WHERE user_id = $1 AND is_active = true`,
        [userId],
      );
      credRow = row;
    } catch {
      throw new BadRequestException('Error al obtener credenciales');
    }
    if (!credRow) throw new BadRequestException('Credenciales no encontradas');
    if (credRow.password_hash.startsWith('!')) throw new BadRequestException('Cuenta OAuth — no tiene contraseña local');

    const newHash = await bcrypt.hash(newPassword, 10);
    try {
      await this.db.query(
        `UPDATE auth.credentials SET password_hash = $1, force_password_change = false WHERE user_id = $2`,
        [newHash, userId],
      );
    } catch {
      await this.db.query(
        `UPDATE auth.credentials SET password_hash = $1 WHERE user_id = $2`,
        [newHash, userId],
      );
    }
    return { ok: true };
  }

  async verifyCredentials(userId: string, password: string): Promise<boolean> {
    const [cred] = await this.db.query<{ password_hash: string }[]>(
      `SELECT password_hash FROM auth.credentials WHERE user_id = $1 AND is_active = true`,
      [userId],
    );
    if (!cred || cred.password_hash.startsWith('!')) return false;
    return bcrypt.compare(password, cred.password_hash);
  }

  async validateToken(token: string) {
    try { return this.jwt.verify(token); }
    catch { throw new UnauthorizedException(); }
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  async sendEmailOtp(userId: string, email: string): Promise<void> {
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = this.hash(rawCode);

    await this.db.query(
      `UPDATE auth.email_otp SET used_at = now()
       WHERE user_id = $1 AND used_at IS NULL AND expires_at > now()`,
      [userId],
    );
    await this.db.query(
      `INSERT INTO auth.email_otp (user_id, code_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '${OTP_EXPIRY_MINUTES} minutes')`,
      [userId, codeHash],
    );

    // Always log to terminal for dev/debugging
    this.logger.log(`\n┌─────────────────────────────────────┐\n│  OTP → ${email.padEnd(27)}│\n│  Código: ${rawCode}                      │\n│  Válido: ${OTP_EXPIRY_MINUTES} minutos                      │\n└─────────────────────────────────────┘`);

    await this.sendOtpEmail(email, rawCode);
  }

  private async buildSession(userId: string, email: string, firstName: string, lastName: string, isSuperadmin: boolean, ip?: string, userAgent?: string) {
    const payload     = { sub: userId, email };
    const access_token  = this.jwt.sign(payload, { expiresIn: '15m' });
    const refresh_token = this.jwt.sign(payload, { expiresIn: '7d' });

    const [profileData] = await this.db.query<{ profile_complete: boolean }[]>(
      `SELECT profile_complete FROM users.profiles WHERE id = $1`,
      [userId],
    );
    let credData: { force_password_change: boolean } | undefined;
    try {
      const [row] = await this.db.query<{ force_password_change: boolean }[]>(
        `SELECT COALESCE(force_password_change, false) AS force_password_change FROM auth.credentials WHERE user_id = $1`,
        [userId],
      );
      credData = row;
    } catch {
      // Column does not exist yet — migration pending. Default to false.
      credData = undefined;
    }

    await this.db.query(
      `INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '7 days')`,
      [userId, this.hash(refresh_token)],
    );
    const [{ id: sessionId }] = await this.db.query<{ id: string }[]>(
      `INSERT INTO auth.sessions (user_id, ip_address, user_agent, expires_at)
       VALUES ($1, $2::inet, $3, now() + INTERVAL '7 days')
       RETURNING id`,
      [userId, ip ?? null, userAgent ?? null],
    );

    // Geo lookup — fire-and-forget, does not block login response
    if (ip && !this.isPrivateIp(ip)) {
      this.lookupGeoAndStore(sessionId, ip).catch(() => {});
    }

    return {
      access_token,
      refresh_token,
      user: {
        id:                     userId,
        email,
        name:                   `${firstName} ${lastName}`.trim(),
        is_superadmin:          isSuperadmin,
        profile_complete:       profileData?.profile_complete ?? false,
        force_password_change:  credData?.force_password_change ?? false,
      },
    };
  }

  // ─── Heartbeat — online/offline ──────────────────────────────────────────────

  async heartbeat(userId: string): Promise<{ ok: boolean }> {
    await this.db.query(
      `UPDATE users.profiles SET last_seen_at = now() WHERE id = $1`,
      [userId],
    );
    return { ok: true };
  }

  // ─── Terminate specific session ───────────────────────────────────────────────

  async terminateSession(userId: string, sessionId: string): Promise<{ ok: boolean }> {
    const [session] = await this.db.query<{ id: string }[]>(
      `SELECT id FROM auth.sessions
       WHERE  id = $1 AND user_id = $2 AND ended_at IS NULL`,
      [sessionId, userId],
    );
    if (!session) throw new NotFoundException('Sesión no encontrada o ya cerrada');

    await this.db.query(
      `UPDATE auth.sessions SET ended_at = now() WHERE id = $1`,
      [sessionId],
    );
    return { ok: true };
  }

  // ─── Geo lookup (ip-api.com free tier) ───────────────────────────────────────

  private isPrivateIp(ip: string): boolean {
    const clean = ip.replace(/^::ffff:/, '');
    if (clean === '127.0.0.1' || clean === '::1' || clean === 'localhost') return true;
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(clean);
  }

  private async lookupGeoAndStore(sessionId: string, ip: string): Promise<void> {
    const geo = await this.lookupGeo(ip);
    if (!geo) return;
    await this.db.query(
      `UPDATE auth.sessions
       SET    geo_city = $1, geo_country = $2, geo_country_code = $3,
              geo_lat  = $4, geo_lon     = $5
       WHERE  id = $6`,
      [geo.city, geo.country, geo.countryCode, geo.lat, geo.lon, sessionId],
    );
  }

  private lookupGeo(ip: string): Promise<{
    city: string; country: string; countryCode: string; lat: number; lon: number;
  } | null> {
    return new Promise((resolve) => {
      const req = http.get(
        `http://ip-api.com/json/${ip}?fields=status,country,countryCode,city,lat,lon`,
        (res) => {
          let raw = '';
          res.on('data', (c) => { raw += c; });
          res.on('end', () => {
            try {
              const d = JSON.parse(raw);
              resolve(d.status === 'success' ? d : null);
            } catch {
              resolve(null);
            }
          });
        },
      );
      req.setTimeout(3000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
    });
  }

  private hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private async sendOtpEmail(to: string, code: string) {
    const appName = this.config.get<string>('APP_NAME') ?? 'Tickets System';
    const digits = code.split('').join('  ');
    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 20px">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;border:1px solid #334155;overflow:hidden">
        <tr><td style="background:linear-gradient(135deg,#312e81,#1e1b4b);padding:32px;text-align:center">
          <h1 style="margin:0;color:#e2e8f0;font-size:20px;font-weight:700">${appName}</h1>
        </td></tr>
        <tr><td style="padding:40px 32px">
          <h2 style="margin:0 0 8px;color:#e2e8f0;font-size:18px;font-weight:600">Verificación de acceso</h2>
          <p style="margin:0 0 32px;color:#94a3b8;font-size:14px;line-height:1.6">
            Ingresa este código en la pantalla de verificación. Válido por <strong style="color:#e2e8f0">${OTP_EXPIRY_MINUTES} minutos</strong>.
          </p>
          <div style="background:#0f172a;border:1px solid #6366f1;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px">
            <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em">Tu código de verificación</p>
            <p style="margin:0;color:#a5b4fc;font-size:40px;font-weight:700;letter-spacing:.3em;font-family:'Courier New',monospace">${digits}</p>
          </div>
          <div style="background:#1c1917;border:1px solid #78350f;border-radius:8px;padding:16px;margin-bottom:24px">
            <p style="margin:0;color:#fbbf24;font-size:13px">
              <strong>No compartas este código.</strong> Nunca te lo pediremos por teléfono o chat.
            </p>
          </div>
          <p style="margin:0;color:#475569;font-size:12px;line-height:1.6">
            Si no intentaste iniciar sesión, ignora este correo. Tu cuenta sigue segura.
          </p>
        </td></tr>
        <tr><td style="border-top:1px solid #1e293b;padding:20px 32px;text-align:center">
          <p style="margin:0;color:#334155;font-size:11px">${appName} · Acceso seguro</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await this.sendEmail(to, `${code} es tu código de verificación — ${appName}`, html);
  }

  private async sendEmail(to: string, subject: string, html: string) {
    const smtpHost = this.config.get<string>('SMTP_HOST');
    const smtpPass = (this.config.get<string>('SMTP_PASS') ?? '').trim();
    const appName  = this.config.get<string>('APP_NAME') ?? 'Tickets System';
    const from     = this.config.get<string>('EMAIL_FROM') ?? 'noreply@tickets.app';

    if (smtpHost && smtpPass) {
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: parseInt(this.config.get<string>('SMTP_PORT') ?? '587'),
        secure: (this.config.get<string>('SMTP_PORT') ?? '587') === '465',
        auth: {
          user: this.config.get<string>('SMTP_USER'),
          pass: smtpPass,
        },
      });
      try {
        await transporter.sendMail({ from: `"${appName}" <${from}>`, to, subject, html });
        this.logger.log(`Email enviado via SMTP a ${to}`);
        return;
      } catch (err) {
        this.logger.error(`SMTP error: ${err.message} — usando Resend como fallback`);
      }
    }

    // Fallback: Resend
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(`Sin config de email. Configura SMTP_PASS o RESEND_API_KEY.`);
      return;
    }
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from: 'onboarding@resend.dev',
      to,
      subject,
      html,
    });
    if (error) this.logger.error(`Resend error: ${error.message}`);
    else this.logger.log(`Email enviado via Resend a ${to}`);
  }
}
