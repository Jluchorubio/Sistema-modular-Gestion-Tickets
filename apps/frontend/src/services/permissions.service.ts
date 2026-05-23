import api from './api';

export interface PermissionDef {
  key:        string;
  label:      string;
  description: string | null;
  parent_key: string | null;
  scope:      string;
  section:    string;
  action:     string;
  sort_order: number;
}

export interface RoleInfo {
  id:          string;
  name:        string;
  description: string | null;
  is_active:   boolean;
  is_admin?:   boolean;
}

export interface ModuleScope {
  id:               string;
  name:             string;
  permission_scope: string;
}

const BASE = '/permissions';

export const permissionsService = {
  getMyPermissions: () =>
    api.get<string[]>(`${BASE}/mine`).then(r => r.data),

  getPermissionTree: () =>
    api.get<PermissionDef[]>(`${BASE}/tree`).then(r => r.data),

  getModulesWithScopes: () =>
    api.get<ModuleScope[]>(`${BASE}/modules`).then(r => r.data),

  getGlobalRoles: () =>
    api.get<RoleInfo[]>(`${BASE}/roles/global`).then(r => r.data),

  getGlobalRoleGrants: (roleId: string) =>
    api.get<string[]>(`${BASE}/roles/global/${roleId}/grants`).then(r => r.data),

  getModuleRoles: (moduleId: string) =>
    api.get<RoleInfo[]>(`${BASE}/roles/module/${moduleId}`).then(r => r.data),

  getModuleRoleGrants: (roleId: string) =>
    api.get<string[]>(`${BASE}/roles/module-role/${roleId}/grants`).then(r => r.data),

  toggleGrant: (roleId: string, permKey: string, granted: boolean, roleType: 'global' | 'module') =>
    api.patch(`${BASE}/roles/${roleId}/grant`, {
      permission_key: permKey,
      granted,
      role_type: roleType,
    }).then(r => r.data),

  grantAllChildren: (roleId: string, parentKey: string, roleType: 'global' | 'module') =>
    api.post(`${BASE}/roles/${roleId}/grant-children`, {
      parent_key: parentKey,
      role_type: roleType,
    }).then(r => r.data),

  revokeAllChildren: (roleId: string, parentKey: string) =>
    api.post(`${BASE}/roles/${roleId}/revoke-children`, { parent_key: parentKey }).then(r => r.data),
};
