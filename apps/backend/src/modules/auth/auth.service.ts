import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AuthService {
  private readonly admin: SupabaseClient;
  private readonly anon: SupabaseClient;

  constructor(private readonly config: ConfigService) {
    const url = this.config.get<string>('SUPABASE_URL')!;
    this.admin = createClient(url, this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!);
    this.anon  = createClient(url, this.config.get<string>('SUPABASE_ANON_KEY')!);
  }

  async login(email: string, password: string) {
    const { data, error } = await this.anon.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new UnauthorizedException(error?.message ?? 'Login failed');

    const { user, session } = data;

    // Check if user has TOTP enrolled → require MFA upgrade
    if (session.aal === 'aal1') {
      const { data: mfaData } = await this.admin.auth.admin.mfa.listFactors({ userId: user.id });
      const totpFactor = mfaData?.factors?.find(
        (f) => f.factor_type === 'totp' && f.status === 'verified',
      );

      if (totpFactor) {
        return {
          requires_mfa: true,
          factor_id: totpFactor.id,
          // aal1 token — only valid for MFA challenge, not API access
          mfa_token: session.access_token,
        };
      }
    }

    return {
      requires_mfa: false,
      access_token: session.access_token,
      refresh_token: session.refresh_token,
      expires_at: session.expires_at,
      user: { id: user.id, email: user.email, name: user.user_metadata?.full_name },
    };
  }

  async verifyMfa(factorId: string, code: string, aal1Token: string) {
    // Attach aal1 token so Supabase upgrades the session to aal2
    const userClient = createClient(
      this.config.get<string>('SUPABASE_URL')!,
      this.config.get<string>('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${aal1Token}` } } },
    );

    const { data: challenge, error: challengeErr } = await userClient.auth.mfa.challenge({ factorId });
    if (challengeErr) throw new BadRequestException(challengeErr.message);

    const { data, error } = await userClient.auth.mfa.verify({
      factorId,
      challengeId: challenge.id,
      code,
    });
    if (error) throw new UnauthorizedException('Código 2FA inválido');

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.full_name },
    };
  }

  async getGoogleOAuthUrl(redirectTo?: string) {
    const appUrl = this.config.get<string>('APP_URL') ?? 'http://localhost:3000';
    const { data, error } = await this.anon.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo ?? `${appUrl}/auth/callback`,
        scopes: 'email profile',
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (error) throw new BadRequestException(error.message);
    return { url: data.url };
  }

  async refreshSession(refreshToken: string) {
    const { data, error } = await this.anon.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) throw new UnauthorizedException(error?.message ?? 'Refresh failed');
    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    };
  }

  async getMe(accessToken: string) {
    const { data, error } = await this.admin.auth.getUser(accessToken);
    if (error || !data.user) throw new UnauthorizedException('Token inválido');
    const u = data.user;
    return { id: u.id, email: u.email, name: u.user_metadata?.full_name, role: u.role };
  }

  async logout(accessToken: string) {
    const userClient = createClient(
      this.config.get<string>('SUPABASE_URL')!,
      this.config.get<string>('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
    );
    await userClient.auth.signOut();
    return { ok: true };
  }

  async validateToken(token: string) {
    const { data, error } = await this.admin.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException();
    return data.user;
  }
}
