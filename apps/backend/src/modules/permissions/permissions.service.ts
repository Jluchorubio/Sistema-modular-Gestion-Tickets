import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class PermissionsService {
  private readonly cache = new Map<string, { keys: Set<string>; expiresAt: number }>();
  private readonly TTL = 60_000;

  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async getUserPermissions(userId: string): Promise<Set<string>> {
    const cached = this.cache.get(userId);
    if (cached && cached.expiresAt > Date.now()) return cached.keys;

    const [profile] = await this.db.query<{ is_superadmin: boolean; global_role_id: string | null }[]>(
      `SELECT is_superadmin, global_role_id FROM users.profiles WHERE id = $1 AND deleted_at IS NULL`,
      [userId],
    );

    if (!profile) return new Set();

    const keys = new Set<string>();

    if (profile.is_superadmin) {
      keys.add('*');
      const all = await this.db.query<{ key: string }[]>(
        `SELECT key FROM config.permission_definitions WHERE is_active = TRUE`,
      );
      all.forEach(p => keys.add(p.key));
    } else {
      // Global role permissions
      if (profile.global_role_id) {
        const rows = await this.db.query<{ permission_key: string }[]>(
          `SELECT permission_key FROM config.role_permission_grants
           WHERE role_id = $1 AND role_type = 'global'`,
          [profile.global_role_id],
        );
        rows.forEach(r => keys.add(r.permission_key));
      }

      // Module role permissions (union across all modules)
      const modRows = await this.db.query<{ permission_key: string }[]>(
        `SELECT DISTINCT rpg.permission_key
         FROM   modules.user_module_roles umr
         JOIN   modules.module_roles mr ON mr.id = umr.role_id AND mr.is_active = TRUE
         JOIN   config.role_permission_grants rpg
                ON rpg.role_id = umr.role_id AND rpg.role_type = 'module'
         WHERE  umr.user_id = $1 AND umr.is_active = TRUE`,
        [userId],
      );
      modRows.forEach(r => keys.add(r.permission_key));

      // Auto-grant {scope}:module:access for every active module role
      const scopes = await this.db.query<{ permission_scope: string }[]>(
        `SELECT DISTINCT m.permission_scope
         FROM   modules.user_module_roles umr
         JOIN   modules.modules m ON m.id = umr.module_id
         WHERE  umr.user_id = $1 AND umr.is_active = TRUE
           AND  m.deleted_at IS NULL AND m.permission_scope IS NOT NULL`,
        [userId],
      );
      scopes.forEach(s => keys.add(`${s.permission_scope}:module:access`));
    }

    this.cache.set(userId, { keys, expiresAt: Date.now() + this.TTL });
    return keys;
  }

  async hasPermission(userId: string, permKey: string): Promise<boolean> {
    const perms = await this.getUserPermissions(userId);
    return perms.has('*') || perms.has(permKey);
  }

  invalidateUser(userId: string) {
    this.cache.delete(userId);
  }

  invalidateAll() {
    this.cache.clear();
  }

  /* ── UI helpers ─────────────────────────────────────────────────── */

  async getPermissionTree() {
    return this.db.query<any[]>(
      `SELECT key, label, description, parent_key, scope, section, action, sort_order
       FROM config.permission_definitions
       WHERE is_active = TRUE
       ORDER BY sort_order`,
    );
  }

  async getGrantsForRole(roleId: string, roleType: 'global' | 'module'): Promise<string[]> {
    const rows = await this.db.query<{ permission_key: string }[]>(
      `SELECT permission_key FROM config.role_permission_grants
       WHERE role_id = $1 AND role_type = $2`,
      [roleId, roleType],
    );
    return rows.map(r => r.permission_key);
  }

  async toggleGrant(roleId: string, roleType: 'global' | 'module', key: string, grant: boolean) {
    if (grant) {
      await this.db.query(
        `INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
         VALUES ($1, $2, $3) ON CONFLICT (role_id, permission_key) DO NOTHING`,
        [roleId, roleType, key],
      );
    } else {
      await this.db.query(
        `DELETE FROM config.role_permission_grants WHERE role_id = $1 AND permission_key = $2`,
        [roleId, key],
      );
    }
    this.invalidateAll();
    return { ok: true };
  }

  async grantAllChildren(roleId: string, roleType: 'global' | 'module', parentKey: string) {
    await this.db.query(
      `WITH RECURSIVE children AS (
         SELECT key FROM config.permission_definitions WHERE parent_key = $1 AND is_active = TRUE
         UNION ALL
         SELECT pd.key FROM config.permission_definitions pd
         JOIN children c ON pd.parent_key = c.key WHERE pd.is_active = TRUE
       )
       INSERT INTO config.role_permission_grants (role_id, role_type, permission_key)
       SELECT $2, $3, key FROM children
       ON CONFLICT (role_id, permission_key) DO NOTHING`,
      [parentKey, roleId, roleType],
    );
    this.invalidateAll();
    return { ok: true };
  }

  async revokeAllChildren(roleId: string, parentKey: string) {
    await this.db.query(
      `WITH RECURSIVE children AS (
         SELECT key FROM config.permission_definitions WHERE parent_key = $1
         UNION ALL
         SELECT pd.key FROM config.permission_definitions pd
         JOIN children c ON pd.parent_key = c.key
       )
       DELETE FROM config.role_permission_grants
       WHERE role_id = $2 AND permission_key IN (SELECT key FROM children)`,
      [parentKey, roleId],
    );
    this.invalidateAll();
    return { ok: true };
  }

  async getGlobalRoles() {
    return this.db.query<any[]>(
      `SELECT id, name, description, is_active FROM config.global_roles ORDER BY name`,
    );
  }

  async getModuleRoles(moduleId: string) {
    return this.db.query<any[]>(
      `SELECT mr.id, mr.name, mr.description, mr.is_active, mr.is_admin
       FROM modules.module_roles mr
       WHERE mr.module_id = $1 AND mr.is_active = TRUE
       ORDER BY mr.name`,
      [moduleId],
    );
  }

  async getModulesWithScopes() {
    return this.db.query<any[]>(
      `SELECT id, name, permission_scope FROM modules.modules
       WHERE deleted_at IS NULL AND is_active = TRUE AND permission_scope IS NOT NULL
       ORDER BY name`,
    );
  }
}
