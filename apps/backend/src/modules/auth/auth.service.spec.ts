import 'reflect-metadata';
import { AuthService } from './auth.service';
import { UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
  genSalt: jest.fn(),
}));
const bcryptCompare = bcrypt.compare as jest.MockedFunction<typeof bcrypt.compare>;

const FAKE_CRED = {
  cred_id:               'cred-1',
  user_id:               'user-1',
  email:                 'test@example.com',
  password_hash:         '$2b$10$hashedpassword',
  is_active:             true,
  login_locked_until:    null,
  failed_login_attempts: 0,
  first_name:            'Test',
  last_name:             'User',
  is_superadmin:         false,
};

function makeService() {
  // Default to resolved [] so fire-and-forget queries (auditAuthEvent) don't crash
  const mockDb = { query: jest.fn().mockResolvedValue([]) };
  const mockJwt = {
    sign:   jest.fn().mockReturnValue('signed-token'),
    verify: jest.fn(),
  };
  const mockConfig = { get: jest.fn().mockReturnValue('test-secret') };

  const svc = new AuthService(mockDb as any, mockJwt as any, mockConfig as any);
  return { svc, mockDb, mockJwt };
}

describe('AuthService', () => {
  beforeEach(() => jest.clearAllMocks());

  /* ── getAccessContact ────────────────────────────────────────────────────── */
  describe('getAccessContact', () => {
    it('returns superadmin email when found', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ email: 'admin@example.com' }]);

      const result = await svc.getAccessContact();
      expect(result).toEqual({ email: 'admin@example.com' });
      expect(mockDb.query).toHaveBeenCalledTimes(1);
    });

    it('falls back to org contact_email', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([])                                   // no superadmin
        .mockResolvedValueOnce([{ contact_email: 'org@example.com' }]);

      const result = await svc.getAccessContact();
      expect(result).toEqual({ email: 'org@example.com' });
    });

    it('returns null when no contact found', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ contact_email: null }]);

      const result = await svc.getAccessContact();
      expect(result).toEqual({ email: null });
    });
  });

  /* ── login ───────────────────────────────────────────────────────────────── */
  describe('login', () => {
    it('throws UnauthorizedException when user not found', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([]);  // no credential rows

      await expect(svc.login('unknown@x.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException when credential inactive', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ ...FAKE_CRED, is_active: false }]);

      await expect(svc.login('test@example.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws 429 when account is locked', async () => {
      const { svc, mockDb } = makeService();
      const lockUntil = new Date(Date.now() + 5 * 60_000);
      mockDb.query.mockResolvedValueOnce([{ ...FAKE_CRED, login_locked_until: lockUntil }]);

      const err = await svc.login('test@example.com', 'pw').catch(e => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.getResponse().locked).toBe(true);
    });

    it('throws UnauthorizedException for OAuth-only account', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query.mockResolvedValueOnce([{ ...FAKE_CRED, password_hash: '!oauth' }]);

      await expect(svc.login('test@example.com', 'pw')).rejects.toThrow(UnauthorizedException);
    });

    it('throws 401 with attempts_remaining on wrong password', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([FAKE_CRED])   // credentials lookup
        .mockResolvedValueOnce([]);            // UPDATE failed_login_attempts

      (bcryptCompare as jest.Mock).mockResolvedValueOnce(false);

      const err = await svc.login('test@example.com', 'wrongpw').catch(e => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      expect(err.getResponse().attempts_remaining).toBeDefined();
    });

    it('locks account after MAX_LOGIN_ATTEMPTS failures', async () => {
      const { svc, mockDb } = makeService();
      const nearLockCred = { ...FAKE_CRED, failed_login_attempts: 2 };  // 3rd attempt
      mockDb.query
        .mockResolvedValueOnce([nearLockCred])  // credentials lookup
        .mockResolvedValueOnce([]);              // UPDATE lock

      (bcryptCompare as jest.Mock).mockResolvedValueOnce(false);

      const err = await svc.login('test@example.com', 'wrongpw').catch(e => e);
      expect(err).toBeInstanceOf(HttpException);
      expect(err.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(err.getResponse().locked).toBe(true);

      // Verify the UPDATE that sets login_locked_until was called
      const updateCall = mockDb.query.mock.calls.find(
        ([sql]: [string]) => sql.includes('login_locked_until'),
      );
      expect(updateCall).toBeDefined();
    });

    it('returns requires_mfa=totp when TOTP enabled', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([FAKE_CRED])                       // credentials
        .mockResolvedValueOnce([])                                 // UPDATE last_login_at
        .mockResolvedValueOnce([{ totp_enabled: true }]);          // mfa_settings

      (bcryptCompare as jest.Mock).mockResolvedValueOnce(true);

      const result = await svc.login('test@example.com', 'correct') as any;
      expect(result.requires_mfa).toBe(true);
      expect(result.mfa_type).toBe('totp');
      expect(result.otp_token).toBe('signed-token');
    });

    it('returns requires_mfa=email_otp when OTP enabled and no TOTP', async () => {
      const { svc, mockDb } = makeService();
      mockDb.query
        .mockResolvedValueOnce([FAKE_CRED])                        // credentials
        .mockResolvedValueOnce([])                                 // UPDATE last_login_at
        .mockResolvedValueOnce([{ totp_enabled: false }])          // mfa_settings (no TOTP)
        .mockResolvedValueOnce([{ otp_enabled: true }])            // otp_enabled check
        // sendEmailOtp internals — return empty rows for any sub-queries
        .mockResolvedValue([]);

      (bcryptCompare as jest.Mock).mockResolvedValueOnce(true);

      // Spy on sendEmailOtp to short-circuit email sending
      jest.spyOn(svc as any, 'sendEmailOtp').mockResolvedValueOnce(undefined);

      const result = await svc.login('test@example.com', 'correct') as any;
      expect(result.requires_mfa).toBe(true);
      expect(result.mfa_type).toBe('email_otp');
    });
  });
});
