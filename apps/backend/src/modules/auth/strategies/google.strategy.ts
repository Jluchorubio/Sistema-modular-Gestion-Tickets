import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    // Usar placeholder si no están configuradas; el endpoint lanzará 503 al usarse
    super({
      clientID:     config.get<string>('GOOGLE_CLIENT_ID')     || 'GOOGLE_NOT_CONFIGURED',
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET') || 'GOOGLE_NOT_CONFIGURED',
      callbackURL:  config.get<string>('GOOGLE_CALLBACK_URL')  ||
                    `${config.get<string>('BACKEND_URL') ?? 'http://localhost:3001/api/v1'}/auth/google/callback`,
      scope: ['email', 'profile'],
    });
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const { name, emails, photos } = profile;
    done(null, {
      email:     emails[0].value,
      firstName: name.givenName,
      lastName:  name.familyName,
      avatar:    photos?.[0]?.value ?? null,
    });
  }
}
