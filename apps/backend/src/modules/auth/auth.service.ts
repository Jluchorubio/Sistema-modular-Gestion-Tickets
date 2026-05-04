import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { Resend } from 'resend';
import { createHash, randomBytes } from 'crypto';

const MFA_INTERVAL_DAYS = 17.5; // 2.5 semanas
const OTP_EXPIRY_MINUTES = 10;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDataSource() private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Login email/password ────────────────────────────────────────────────────

  async login(email: string, password: string) {
    const rows = await this.db.query<any[]>(
      `SELECT c.id        AS cred_id,
              c.user_id,
              c.email,
              c.password_hash,
              c.is_active,
              p.first_name,
              p.last_name,
              p.is_superadmin
       FROM   auth.credentials c
       JOIN   users.profiles   p ON p.id = c.user_id
       WHERE  c.email = $1 AND p.deleted_at IS NULL`,
      [email.toLowerCase().trim()],
    );

    const cred = rows[0];
    if (!cred || !cred.is_active) throw new UnauthorizedException('Credenciales inválidas');
    if (cred.password_hash.startsWith('!')) {
      throw new UnauthorizedException('Cuenta OAuth — usa "Continuar con Google"');
    }

    const valid = await bcrypt.compare(password, cred.password_hash);
    if (!valid) throw new UnauthorizedException('Credenciales inválidas');

    await this.db.query(
      `UPDATE auth.credentials SET last_login_at = now() WHERE id = $1`,
      [cred.cred_id],
    );

    // Check MFA requirement (TOTP tiene prioridad sobre email OTP)
    const mfa = await this.getMfaChallenge(cred.user_id);

    if (mfa.type === 'totp') {
      return {
        requires_mfa: true,
        mfa_type: 'totp',
        mfa_token: this.jwt.sign(
          { sub: cred.user_id, email: cred.email, mfa_pending: true },
          { expiresIn: '5m' },
        ),
      };
    }

    if (mfa.type === 'email_otp') {
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

    return this.buildSession(cred.user_id, cred.email, cred.first_name, cred.last_name, cred.is_superadmin);
  }

  // ─── Google OAuth ────────────────────────────────────────────────────────────

  async loginWithGoogle(profile: { email: string; firstName: string; lastName: string; avatar: string | null }) {
    const rows = await this.db.query<any[]>(
      `SELECT c.user_id, c.email, p.first_name, p.last_name, p.is_superadmin
       FROM auth.credentials c
       JOIN users.profiles p ON p.id = c.user_id
       WHERE c.email = $1 AND p.deleted_at IS NULL`,
      [profile.email.toLowerCase()],
    );

    let user = rows[0];
    if (!user) {
      // Auto-crear usuario OAuth
      const [created] = await this.db.query<any[]>(
        `WITH new_profile AS (
           INSERT INTO users.profiles (first_name, last_name, display_email, avatar_url)
           VALUES ($1, $2, $3, $4) RETURNING id, first_name, last_name, is_superadmin
         )
         INSERT INTO auth.credentials (user_id, email, password_hash)
         SELECT id, $3, '!GOOGLE' FROM new_profile
         RETURNING user_id`,
        [profile.firstName, profile.lastName, profile.email.toLowerCase(), profile.avatar],
      );
      const [profile2] = await this.db.query<any[]>(
        `SELECT p.first_name, p.last_name, p.is_superadmin FROM users.profiles p WHERE p.id = $1`,
        [created.user_id],
      );
      user = { ...created, ...profile2, email: profile.email.toLowerCase() };
    }

    return this.buildSession(user.user_id, user.email, user.first_name, user.last_name, user.is_superadmin);
  }

  // ─── MFA: determinar tipo de challenge ────────────────────────────────────

  private async getMfaChallenge(userId: string): Promise<{ type: 'totp' | 'email_otp' | null }> {
    const rows = await this.db.query<any[]>(
      `SELECT totp_enabled, totp_last_verified_at, COALESCE(email_otp_enabled, false) AS email_otp_enabled
       FROM auth.mfa_settings WHERE user_id = $1`,
      [userId],
    );
    const s = rows[0];
    if (!s) return { type: null };

    if (s.totp_enabled) {
      const lastVerified: Date | null = s.totp_last_verified_at;
      if (!lastVerified) return { type: 'totp' };
      const msSince = Date.now() - new Date(lastVerified).getTime();
      if (msSince > MFA_INTERVAL_DAYS * 24 * 60 * 60 * 1000) return { type: 'totp' };
    }

    if (s.email_otp_enabled) return { type: 'email_otp' };

    return { type: null };
  }

  // ─── MFA: setup (generar QR) ────────────────────────────────────────────────

  async setupMfa(userId: string, email: string) {
    const generated = speakeasy.generateSecret({ length: 20 });
    const secret = generated.base32;
    const appName = this.config.get<string>('APP_NAME') ?? 'Tickets System';
    const otpauthUrl = speakeasy.otpauthURL({
      secret,
      label: encodeURIComponent(email),
      issuer: appName,
      encoding: 'base32',
    });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);

    // Guardar secret (no habilitado aún hasta confirmar)
    await this.db.query(
      `INSERT INTO auth.mfa_settings (user_id, totp_secret, totp_enabled)
       VALUES ($1, $2, false)
       ON CONFLICT (user_id) DO UPDATE SET totp_secret = $2, totp_enabled = false`,
      [userId, secret],
    );

    return { qr_code: qrDataUrl, secret };
  }

  // ─── MFA: habilitar (verificar primer código) ────────────────────────────────

  async enableMfa(userId: string, code: string) {
    const rows = await this.db.query<any[]>(
      `SELECT totp_secret FROM auth.mfa_settings WHERE user_id = $1`,
      [userId],
    );
    if (!rows[0]?.totp_secret) throw new BadRequestException('Primero llama a /auth/mfa/setup');

    const valid = speakeasy.totp.verify({ secret: rows[0].totp_secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) throw new UnauthorizedException('Código inválido');

    await this.db.query(
      `UPDATE auth.mfa_settings
       SET totp_enabled = true, totp_last_verified_at = now()
       WHERE user_id = $1`,
      [userId],
    );
    return { ok: true, message: '2FA habilitado' };
  }

  // ─── MFA: verificar durante login ────────────────────────────────────────────

  async verifyMfa(mfaToken: string, code: string) {
    let payload: any;
    try {
      payload = this.jwt.verify(mfaToken);
    } catch {
      throw new UnauthorizedException('mfa_token inválido o expirado');
    }
    if (!payload.mfa_pending) throw new UnauthorizedException('Token no es de MFA');

    const rows = await this.db.query<any[]>(
      `SELECT totp_secret FROM auth.mfa_settings
       WHERE user_id = $1 AND totp_enabled = true`,
      [payload.sub],
    );
    if (!rows[0]) throw new BadRequestException('MFA no configurado');

    const valid = speakeasy.totp.verify({ secret: rows[0].totp_secret, encoding: 'base32', token: code, window: 1 });
    if (!valid) throw new UnauthorizedException('Código 2FA inválido');

    await this.db.query(
      `UPDATE auth.mfa_settings SET totp_last_verified_at = now() WHERE user_id = $1`,
      [payload.sub],
    );

    const [user] = await this.db.query<any[]>(
      `SELECT p.first_name, p.last_name, p.is_superadmin
       FROM users.profiles p WHERE p.id = $1`,
      [payload.sub],
    );
    return this.buildSession(payload.sub, payload.email, user.first_name, user.last_name, user.is_superadmin);
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

    // Siempre responder OK para no filtrar si el email existe
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
    const resetLink = `${appUrl}/test-auth.html?reset_token=${rawToken}`;

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
    // Revocar todos los refresh tokens activos (seguridad)
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
      `SELECT p.id, p.first_name, p.last_name, p.display_email, p.avatar_url,
              p.is_superadmin, c.email, c.last_login_at,
              COALESCE(m.totp_enabled, false) AS mfa_enabled
       FROM   users.profiles   p
       JOIN   auth.credentials c ON c.user_id = p.id
       LEFT JOIN auth.mfa_settings m ON m.user_id = p.id
       WHERE  p.id = $1 AND p.deleted_at IS NULL`,
      [userId],
    );
    if (!rows[0]) throw new UnauthorizedException();
    const u = rows[0];
    return {
      id:           u.id,
      email:        u.email,
      name:         `${u.first_name} ${u.last_name}`.trim(),
      avatar_url:   u.avatar_url,
      is_superadmin: u.is_superadmin,
      mfa_enabled:  u.mfa_enabled,
      last_login_at: u.last_login_at,
    };
  }

  async validateToken(token: string) {
    try { return this.jwt.verify(token); }
    catch { throw new UnauthorizedException(); }
  }

  // ─── Email OTP ───────────────────────────────────────────────────────────────

  async sendEmailOtp(userId: string, email: string): Promise<void> {
    const rawCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeHash = this.hash(rawCode);

    // Invalida OTPs anteriores activos
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

    await this.sendOtpEmail(email, rawCode);
  }

  async verifyEmailOtp(otpToken: string, code: string) {
    let payload: any;
    try { payload = this.jwt.verify(otpToken); }
    catch { throw new UnauthorizedException('otp_token inválido o expirado'); }
    if (!payload.otp_pending) throw new UnauthorizedException('Token no es de OTP');

    const codeHash = this.hash(code);
    const rows = await this.db.query<any[]>(
      `SELECT id FROM auth.email_otp
       WHERE user_id = $1 AND code_hash = $2
         AND used_at IS NULL AND expires_at > now()`,
      [payload.sub, codeHash],
    );
    if (!rows[0]) throw new UnauthorizedException('Código inválido o expirado');

    await this.db.query(`UPDATE auth.email_otp SET used_at = now() WHERE id = $1`, [rows[0].id]);

    const [user] = await this.db.query<any[]>(
      `SELECT p.first_name, p.last_name, p.is_superadmin, c.email
       FROM users.profiles p JOIN auth.credentials c ON c.user_id = p.id
       WHERE p.id = $1`,
      [payload.sub],
    );
    return this.buildSession(payload.sub, user.email, user.first_name, user.last_name, user.is_superadmin);
  }

  async enableEmailOtp(userId: string) {
    await this.db.query(
      `INSERT INTO auth.mfa_settings (user_id, email_otp_enabled)
       VALUES ($1, true)
       ON CONFLICT (user_id) DO UPDATE SET email_otp_enabled = true`,
      [userId],
    );
    return { ok: true, message: 'Email OTP habilitado' };
  }

  async disableEmailOtp(userId: string) {
    await this.db.query(
      `UPDATE auth.mfa_settings SET email_otp_enabled = false WHERE user_id = $1`,
      [userId],
    );
    return { ok: true, message: 'Email OTP deshabilitado' };
  }

  // ─── Private helpers ─────────────────────────────────────────────────────────

  private async buildSession(userId: string, email: string, firstName: string, lastName: string, isSuperadmin: boolean) {
    const payload     = { sub: userId, email };
    const access_token  = this.jwt.sign(payload, { expiresIn: '15m' });
    const refresh_token = this.jwt.sign(payload, { expiresIn: '7d' });

    await this.db.query(
      `INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '7 days')`,
      [userId, this.hash(refresh_token)],
    );
    await this.db.query(
      `INSERT INTO auth.sessions (user_id, expires_at)
       VALUES ($1, now() + INTERVAL '15 minutes')`,
      [userId],
    );

    return {
      access_token,
      refresh_token,
      user: {
        id:           userId,
        email,
        name:         `${firstName} ${lastName}`.trim(),
        is_superadmin: isSuperadmin,
      },
    };
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

        <!-- Header -->
        <tr><td style="background:linear-gradient(135deg,#312e81,#1e1b4b);padding:32px;text-align:center">
          <p style="margin:0;font-size:28px">🎫</p>
          <h1 style="margin:8px 0 0;color:#e2e8f0;font-size:20px;font-weight:700">${appName}</h1>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:40px 32px">
          <h2 style="margin:0 0 8px;color:#e2e8f0;font-size:18px;font-weight:600">Verificación de acceso</h2>
          <p style="margin:0 0 32px;color:#94a3b8;font-size:14px;line-height:1.6">
            Ingresa este código en la pantalla de verificación. Válido por <strong style="color:#e2e8f0">${OTP_EXPIRY_MINUTES} minutos</strong>.
          </p>

          <!-- OTP Code Box -->
          <div style="background:#0f172a;border:1px solid #6366f1;border-radius:12px;padding:28px;text-align:center;margin-bottom:32px">
            <p style="margin:0 0 8px;color:#94a3b8;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.1em">Tu código de verificación</p>
            <p style="margin:0;color:#a5b4fc;font-size:40px;font-weight:700;letter-spacing:.3em;font-family:'Courier New',monospace">${digits}</p>
          </div>

          <div style="background:#1c1917;border:1px solid #78350f;border-radius:8px;padding:16px;margin-bottom:24px">
            <p style="margin:0;color:#fbbf24;font-size:13px">
              ⚠️ <strong>No compartas este código.</strong> Nunca te lo pediremos por teléfono o chat.
            </p>
          </div>

          <p style="margin:0;color:#475569;font-size:12px;line-height:1.6">
            Si no intentaste iniciar sesión, ignora este correo. Tu cuenta sigue segura.
          </p>
        </td></tr>

        <!-- Footer -->
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
    const apiKey = this.config.get<string>('RESEND_API_KEY');
    if (!apiKey) {
      this.logger.warn(`RESEND_API_KEY no configurada. Email a ${to}: ${subject}`);
      return;
    }
    const resend = new Resend(apiKey);
    const from   = this.config.get<string>('EMAIL_FROM') ?? 'noreply@tickets.app';
    const { error } = await resend.emails.send({ from, to, subject, html });
    if (error) this.logger.error(`Resend error: ${error.message}`);
  }
}
