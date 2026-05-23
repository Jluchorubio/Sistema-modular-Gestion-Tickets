import api from './api';
import type {
  SystemModule,
  ModuleDetail,
  Location,
  Environment,
  ModuleTechnician,
} from '@/types/module.types';

export interface ModuleSlaRule {
  priority:                       string;
  hours_to_resolve:               number;
  hours_to_first_response:        number;
  is_override:                    boolean;
  override_id:                    string | null;
  global_hours_to_resolve:        number;
  global_hours_to_first_response: number;
}

export interface CreateModuleDto {
  name:         string;
  description?: string;
  type?:        string;
  image_url?:   string | null;
  color?:       string;
}

export interface UpdateModuleDto {
  name?:                   string;
  description?:            string;
  type?:                   string;
  image_url?:              string | null;
  color?:                  string;
  is_active?:              boolean;
  access_mode?:            'open' | 'request';
  assignment_mode?:        'manual' | 'round_robin' | 'hybrid';
  priority_mode?:          'auto' | 'manual';
  priority_editors?:       'jefe_tecnico' | 'any_tech';
  priority_period_start?:  string | null;
  priority_period_end?:    string | null;
}

export const modulesService = {
  async getModules(): Promise<SystemModule[]> {
    const { data } = await api.get('/system-modules');
    return data;
  },

  async getModule(id: string): Promise<ModuleDetail> {
    const { data } = await api.get(`/system-modules/${id}`);
    return data;
  },

  async getLocations(): Promise<Location[]> {
    const { data } = await api.get('/system-modules/locations');
    return data;
  },

  async getEnvironments(locationId: string): Promise<Environment[]> {
    const { data } = await api.get(
      `/system-modules/locations/${locationId}/environments`,
    );
    return data;
  },

  async createModule(payload: CreateModuleDto): Promise<SystemModule> {
    const { data } = await api.post('/system-modules', payload);
    return data;
  },

  async updateModule(id: string, payload: UpdateModuleDto): Promise<SystemModule> {
    const { data } = await api.patch(`/system-modules/${id}`, payload);
    return data;
  },

  async deleteModule(id: string): Promise<void> {
    await api.delete(`/system-modules/${id}`);
  },

  async toggleMaintenance(id: string, enabled: boolean, message?: string): Promise<void> {
    await api.patch(`/system-modules/${id}/maintenance`, { enabled, message });
  },

  async getModuleRoles(moduleId: string): Promise<{ id: string; name: string; description: string | null }[]> {
    const { data } = await api.get(`/system-modules/${moduleId}/roles`);
    return data;
  },

  async bulkAssignUsers(moduleId: string, userIds: string[], roleId: string): Promise<void> {
    await api.post(`/users/module/${moduleId}/bulk-assign`, { user_ids: userIds, role_id: roleId });
  },

  /* ── Role CRUD ── */
  async createRole(moduleId: string, name: string, description?: string) {
    const { data } = await api.post(`/system-modules/${moduleId}/roles`, { name, description });
    return data as { id: string; name: string; description: string | null; is_active: boolean };
  },

  async updateRole(roleId: string, dto: { name?: string; description?: string }) {
    const { data } = await api.patch(`/system-modules/roles/${roleId}`, dto);
    return data as { id: string; name: string; description: string | null };
  },

  async deleteRole(roleId: string): Promise<void> {
    await api.delete(`/system-modules/roles/${roleId}`);
  },

  /* ── Permission management ── */
  async getModulePermissions(moduleId: string): Promise<{ id: string; name: string; description: string | null }[]> {
    const { data } = await api.get(`/system-modules/${moduleId}/permissions`);
    return data;
  },

  async createPermission(moduleId: string, name: string, description?: string) {
    const { data } = await api.post(`/system-modules/${moduleId}/permissions`, { name, description });
    return data as { id: string; name: string; description: string | null };
  },

  async deletePermission(permId: string): Promise<void> {
    await api.delete(`/system-modules/permissions/${permId}`);
  },

  async getRolePermissions(roleId: string): Promise<{ id: string; name: string; description: string | null }[]> {
    const { data } = await api.get(`/system-modules/roles/${roleId}/permissions`);
    return data;
  },

  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<{ id: string; name: string }[]> {
    const { data } = await api.put(`/system-modules/roles/${roleId}/permissions`, { permission_ids: permissionIds });
    return data;
  },

  /* ── Module SLA rules ── */

  async getModuleSlaRules(moduleId: string): Promise<ModuleSlaRule[]> {
    const { data } = await api.get(`/system-modules/${moduleId}/sla`);
    return data;
  },

  async upsertModuleSlaRule(
    moduleId: string,
    priority: string,
    dto: { hours_to_resolve: number; hours_to_first_response: number },
  ): Promise<ModuleSlaRule> {
    const { data } = await api.put(`/system-modules/${moduleId}/sla/${priority}`, dto);
    return data;
  },

  async deleteModuleSlaRule(moduleId: string, priority: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/system-modules/${moduleId}/sla/${priority}`);
    return data;
  },

  async getModuleTechnicians(moduleId: string): Promise<ModuleTechnician[]> {
    const { data } = await api.get(`/system-modules/${moduleId}/technicians`);
    return data;
  },
};
