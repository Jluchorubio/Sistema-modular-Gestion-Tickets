import 'reflect-metadata';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { PermissionGuard } from './permission.guard';
import { PermissionsService } from '../../modules/permissions/permissions.service';
import type { ExecutionContext } from '@nestjs/common';

function makeContext(
  user: object | null = null,
  authHeader?: string,
): ExecutionContext {
  const request = {
    user,
    headers: authHeader ? { authorization: authHeader } : {},
  };
  return {
    getHandler: jest.fn().mockReturnValue({}),
    getClass:   jest.fn().mockReturnValue({}),
    switchToHttp: jest.fn().mockReturnValue({
      getRequest: jest.fn().mockReturnValue(request),
    }),
  } as unknown as ExecutionContext;
}

describe('PermissionGuard', () => {
  let guard: PermissionGuard;
  let reflector: jest.Mocked<Pick<Reflector, 'getAllAndOverride'>>;
  let permissionsService: jest.Mocked<Pick<PermissionsService, 'hasPermission'>>;
  let config: jest.Mocked<Pick<ConfigService, 'get'>>;

  beforeEach(() => {
    reflector          = { getAllAndOverride: jest.fn() };
    permissionsService = { hasPermission: jest.fn() };
    config             = { get: jest.fn() };

    guard = new PermissionGuard(
      reflector          as unknown as Reflector,
      permissionsService as unknown as PermissionsService,
      config             as unknown as ConfigService,
    );
  });

  afterEach(() => jest.clearAllMocks());

  it('allows any request when no @RequirePermission decorator is present', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(await guard.canActivate(makeContext())).toBe(true);
    expect(permissionsService.hasPermission).not.toHaveBeenCalled();
  });

  it('passes through when no identity can be extracted (no token, no user)', async () => {
    reflector.getAllAndOverride.mockReturnValue('some:perm');

    expect(await guard.canActivate(makeContext(null))).toBe(true);
    expect(permissionsService.hasPermission).not.toHaveBeenCalled();
  });

  it('allows when user has the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue('inventario:items:view');
    permissionsService.hasPermission.mockResolvedValue(true);

    const ctx = makeContext({ sub: 'user-uuid' });
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(permissionsService.hasPermission).toHaveBeenCalledWith('user-uuid', 'inventario:items:view');
  });

  it('throws ForbiddenException when user lacks the required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue('inventario:items:delete');
    permissionsService.hasPermission.mockResolvedValue(false);

    const ctx = makeContext({ sub: 'regular-user' });
    await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
  });

  it('ForbiddenException message includes the permission key', async () => {
    reflector.getAllAndOverride.mockReturnValue('tickets:admin:delete');
    permissionsService.hasPermission.mockResolvedValue(false);

    try {
      await guard.canActivate(makeContext({ sub: 'uid' }));
      fail('expected ForbiddenException');
    } catch (e: any) {
      expect(e.message).toContain('tickets:admin:delete');
    }
  });

  it('passes through when hasPermission returns null (profile not found → let JwtAuthGuard handle)', async () => {
    reflector.getAllAndOverride.mockReturnValue('some:perm');
    permissionsService.hasPermission.mockResolvedValue(null);

    const ctx = makeContext({ sub: 'ghost-user' });
    expect(await guard.canActivate(ctx)).toBe(true);
  });

  it('extracts userId from Bearer token when request.user is absent', async () => {
    const secret = 'test-secret';
    config.get.mockReturnValue(secret);

    // Sign a minimal JWT manually so we can test token extraction
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
    const token = jwt.sign({ sub: 'token-user' }, secret);

    reflector.getAllAndOverride.mockReturnValue('any:perm');
    permissionsService.hasPermission.mockResolvedValue(true);

    const ctx = makeContext(null, `Bearer ${token}`);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(permissionsService.hasPermission).toHaveBeenCalledWith('token-user', 'any:perm');
  });
});
