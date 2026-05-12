import api from './api';
import type {
  SystemModule,
  ModuleDetail,
  Location,
  Environment,
} from '@/types/module.types';

export interface CreateModuleDto {
  name:         string;
  description?: string;
  type?:        string;
  image_url?:   string | null;
  color?:       string;
}

export interface UpdateModuleDto {
  name?:        string;
  description?: string;
  type?:        string;
  image_url?:   string | null;
  color?:       string;
  is_active?:   boolean;
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

  async getModuleRoles(moduleId: string): Promise<{ id: string; name: string; description: string | null }[]> {
    const { data } = await api.get(`/system-modules/${moduleId}/roles`);
    return data;
  },

  async bulkAssignUsers(moduleId: string, userIds: string[], roleId: string): Promise<void> {
    await api.post(`/users/module/${moduleId}/bulk-assign`, { user_ids: userIds, role_id: roleId });
  },
};
