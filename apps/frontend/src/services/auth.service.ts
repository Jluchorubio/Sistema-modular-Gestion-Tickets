import api from './api';
import type {
  LoginRequest,
  LoginResponse,
  MfaChallenge,
  OtpVerifyResponse,
} from '@/types/auth.types';

export const authService = {
  async getAccessContact(): Promise<{ email: string | null }> {
    const { data } = await api.get('/auth/access-contact');
    return data;
  },

  async login(credentials: LoginRequest): Promise<LoginResponse | MfaChallenge> {
    const { data } = await api.post('/auth/login', credentials);
    return data;
  },

  async verifyOtp(code: string, otpToken: string): Promise<OtpVerifyResponse> {
    const { data } = await api.post(
      '/auth/otp/verify',
      { code },
      { headers: { Authorization: `Bearer ${otpToken}` } },
    );
    return data;
  },

  async resendOtp(otpToken: string): Promise<{ otp_token: string }> {
    const { data } = await api.post(
      '/auth/otp/resend',
      {},
      { headers: { Authorization: `Bearer ${otpToken}` } },
    );
    return data;
  },

  async forgotPassword(email: string): Promise<void> {
    await api.post('/auth/password/forgot', { email });
  },

  async resetPassword(resetToken: string, newPassword: string): Promise<void> {
    await api.post('/auth/password/reset', {
      token: resetToken,
      new_password: newPassword,
    });
  },

  async setupPassword(newPassword: string): Promise<void> {
    await api.patch('/auth/setup-password', { new_password: newPassword });
  },

  async setOtpSetting(enabled: boolean): Promise<void> {
    await api.patch('/auth/otp-setting', { enabled });
  },

  async logout(refreshToken: string): Promise<void> {
    await api.post('/auth/logout', { refresh_token: refreshToken });
  },

  async setupTotp(): Promise<{ qr: string; secret: string }> {
    const { data } = await api.get('/auth/totp/setup');
    return data;
  },

  async enableTotp(code: string): Promise<{ ok: boolean; totp_enabled: boolean }> {
    const { data } = await api.post('/auth/totp/enable', { code });
    return data;
  },

  async disableTotp(code: string): Promise<{ ok: boolean; totp_enabled: boolean }> {
    const { data } = await api.post('/auth/totp/disable', { code });
    return data;
  },

  async verifyCredentials(password: string): Promise<void> {
    await api.post('/auth/verify-credentials', { password });
  },

  async heartbeat(): Promise<void> {
    await api.patch('/auth/heartbeat');
  },

  async terminateSession(sessionId: string): Promise<void> {
    await api.delete(`/auth/sessions/${sessionId}`);
  },
};
