import 'reflect-metadata';
import { PermissionsService } from './permissions.service';

describe('PermissionsService', () => {
  let service: PermissionsService;
  let mockDb: { query: jest.Mock };

  beforeEach(() => {
    mockDb = { query: jest.fn() };
    service = new PermissionsService(mockDb as any);
  });

  afterEach(() => jest.clearAllMocks());

  describe('hasPermission', () => {
    it('returns true for superadmin on any permission key', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ is_superadmin: true, global_role_id: null }])
        .mockResolvedValueOnce([{ key: 'helpdesk:tickets:view' }]);

      expect(await service.hasPermission('super-uid', 'any:random:key')).toBe(true);
    });

    it('returns true when user has the specific permission via global role', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: 'role-1' }])
        .mockResolvedValueOnce([{ permission_key: 'inventario:items:edit' }]) // global role grants
        .mockResolvedValueOnce([])   // module role perms
        .mockResolvedValueOnce([]);  // module scopes

      expect(await service.hasPermission('user-uid', 'inventario:items:edit')).toBe(true);
    });

    it('returns false when user lacks the permission', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: 'role-1' }])
        .mockResolvedValueOnce([{ permission_key: 'helpdesk:tickets:view' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      expect(await service.hasPermission('user-uid', 'inventario:items:delete')).toBe(false);
    });

    it('returns null when profile not found (deleted user)', async () => {
      mockDb.query.mockResolvedValueOnce([]);

      expect(await service.hasPermission('deleted-uid', 'any:perm')).toBeNull();
    });

    it('grants module:access automatically for active module role', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: null }])
        // no global role queries since global_role_id is null
        .mockResolvedValueOnce([])  // module role perms (none)
        .mockResolvedValueOnce([{ permission_scope: 'inventario' }]); // scope auto-grant

      expect(await service.hasPermission('user-uid', 'inventario:module:access')).toBe(true);
    });

    it('uses cache on second call (no extra DB queries)', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: null }])
        .mockResolvedValueOnce([])  // module perms
        .mockResolvedValueOnce([]); // module scopes

      await service.hasPermission('uid-cache', 'some:perm');
      await service.hasPermission('uid-cache', 'other:perm');

      // profile + 2 module queries on first call only; second call hits cache
      expect(mockDb.query).toHaveBeenCalledTimes(3);
    });

    it('invalidateUser forces re-query on next call', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: null }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]) // first call queries
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: null }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]); // post-invalidate queries

      await service.hasPermission('uid-inv', 'x');
      service.invalidateUser('uid-inv');
      await service.hasPermission('uid-inv', 'x');

      expect(mockDb.query).toHaveBeenCalledTimes(6);
    });

    it('invalidateAll clears every cached entry', async () => {
      mockDb.query
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: null }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ is_superadmin: false, global_role_id: null }])
        .mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await service.hasPermission('uid-a', 'x');
      service.invalidateAll();
      await service.hasPermission('uid-a', 'x');

      expect(mockDb.query).toHaveBeenCalledTimes(6);
    });
  });
});
