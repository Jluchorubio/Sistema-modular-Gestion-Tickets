import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient } from '@supabase/supabase-js';

@Injectable()
export class AuthService {
  private supabase = createClient(
    this.config.get<string>('SUPABASE_URL')!,
    this.config.get<string>('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  constructor(private readonly config: ConfigService) {}

  async validateToken(token: string) {
    const { data, error } = await this.supabase.auth.getUser(token);
    if (error || !data.user) throw new UnauthorizedException();
    return data.user;
  }
}
