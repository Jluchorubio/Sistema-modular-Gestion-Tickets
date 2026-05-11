export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  is_superadmin: boolean;
  profile_complete: boolean;
  force_password_change: boolean;
  avatar_url: string | null;
}

export interface LoginResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export interface MfaChallenge {
  requires_mfa: true;
  mfa_type: 'email_otp';
  otp_token: string;
}

export interface OtpVerifyResponse {
  access_token: string;
  refresh_token: string;
  user: AuthUser;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token: string;
}

export interface LockoutInfo {
  locked: true;
  locked_until?: string;
  message: string;
}

export interface AttemptsInfo {
  attempts_remaining: number;
  message: string;
}
