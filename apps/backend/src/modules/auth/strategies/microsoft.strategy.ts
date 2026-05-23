import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-oauth2';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(config: ConfigService) {
    super({
      authorizationURL: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenURL:         'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      clientID:         config.get<string>('MICROSOFT_CLIENT_ID')     || 'MICROSOFT_NOT_CONFIGURED',
      clientSecret:     config.get<string>('MICROSOFT_CLIENT_SECRET') || 'MICROSOFT_NOT_CONFIGURED',
      callbackURL:      config.get<string>('MICROSOFT_CALLBACK_URL')  ||
                        'http://localhost:3001/api/v1/auth/microsoft/callback',
      scope:            ['openid', 'email', 'profile', 'User.Read'],
    });
  }

  async validate(
    accessToken: string,
    _refreshToken: string,
    _profile: unknown,
    done: (err: Error | null, user: unknown) => void,
  ): Promise<void> {
    try {
      const resp = await fetch(
        'https://graph.microsoft.com/v1.0/me?$select=displayName,givenName,surname,mail,userPrincipalName',
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (!resp.ok) {
        done(new Error('Error al obtener perfil de Microsoft'), null);
        return;
      }
      const data = await resp.json() as {
        displayName?: string;
        givenName?:   string;
        surname?:     string;
        mail?:        string;
        userPrincipalName?: string;
      };
      done(null, {
        email:     data.mail ?? data.userPrincipalName ?? '',
        firstName: data.givenName ?? data.displayName?.split(' ')[0] ?? '',
        lastName:  data.surname   ?? data.displayName?.split(' ').slice(1).join(' ') ?? '',
        avatar:    null,
      });
    } catch (err) {
      done(err as Error, null);
    }
  }
}
