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
  specialization_mode?:    'general' | 'specialist' | 'hybrid';
  auto_close_hours?:       number;
}

export interface FieldDef {
  key:      string;
  label:    string;
  type:     'text' | 'number' | 'date' | 'select' | 'boolean';
  required: boolean;
  options?: string[];
}

export interface ModuleCategory {
  id:           string;
  module_id:    string;
  parent_id:    string | null;
  parent_name:  string | null;
  name:         string;
  description:  string | null;
  is_active:    boolean;
  field_schema: FieldDef[];
  created_at:   string;
  updated_at:   string;
}

export interface ModuleLocation {
  id:           string;
  module_id:    string;
  name:         string;
  address:      string | null;
  is_active:    boolean;
  created_at:   string;
  environments: ModuleEnvironment[];
}

export interface ModuleEnvironment {
  id:          string;
  name:        string;
  description: string | null;
  is_active:   boolean;
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

  async setTechnicianStatus(
    moduleId: string,
    dto: { status: string; reason?: string; unavailable_to?: string },
  ): Promise<{ ok: boolean; status: string; is_available: boolean }> {
    const { data } = await api.patch(`/system-modules/${moduleId}/technicians/status`, dto);
    return data;
  },

  /* ── Categories ── */
  async getCategories(moduleId: string): Promise<ModuleCategory[]> {
    const { data } = await api.get(`/system-modules/${moduleId}/categories`);
    return data;
  },

  async createCategory(moduleId: string, dto: { name: string; description?: string; parent_id?: string | null; field_schema?: FieldDef[] }): Promise<ModuleCategory> {
    const { data } = await api.post(`/system-modules/${moduleId}/categories`, dto);
    return data;
  },

  async updateCategory(catId: string, dto: { name?: string; description?: string; is_active?: boolean; field_schema?: FieldDef[] }): Promise<ModuleCategory> {
    const { data } = await api.patch(`/system-modules/categories/${catId}`, dto);
    return data;
  },

  async deleteCategory(catId: string): Promise<{ ok: boolean; message: string }> {
    const { data } = await api.delete(`/system-modules/categories/${catId}`);
    return data;
  },

  /* ── Locations + Environments ── */
  async getModuleLocations(moduleId: string): Promise<ModuleLocation[]> {
    const { data } = await api.get(`/system-modules/${moduleId}/locations`);
    return data;
  },

  async createLocation(moduleId: string, dto: { name: string; address?: string }): Promise<ModuleLocation> {
    const { data } = await api.post(`/system-modules/${moduleId}/locations`, dto);
    return data;
  },

  async updateLocation(locId: string, dto: { name?: string; address?: string; is_active?: boolean }): Promise<ModuleLocation> {
    const { data } = await api.patch(`/system-modules/locations/${locId}`, dto);
    return data;
  },

  async deleteLocation(locId: string): Promise<{ ok: boolean; message: string }> {
    const { data } = await api.delete(`/system-modules/locations/${locId}`);
    return data;
  },

  async createEnvironment(moduleId: string, locId: string, dto: { name: string; description?: string }): Promise<ModuleEnvironment> {
    const { data } = await api.post(`/system-modules/${moduleId}/locations/${locId}/environments`, dto);
    return data;
  },

  async updateEnvironment(envId: string, dto: { name?: string; description?: string; is_active?: boolean }): Promise<ModuleEnvironment> {
    const { data } = await api.patch(`/system-modules/environments/${envId}`, dto);
    return data;
  },

  async deleteEnvironment(envId: string): Promise<{ ok: boolean; message: string }> {
    const { data } = await api.delete(`/system-modules/environments/${envId}`);
    return data;
  },
};
