import api from './api';
import type {
  User,
  CurrentUser,
  GlobalRole,
  UserModuleRole,
} from '@/types/user.types';
import type { PaginatedResponse, PaginationParams } from '@/types/api.types';

export interface UserModuleRoleBrief {
  module: string;
  role: string;
}

export interface UserListItem extends User {
  global_role:    string | null;
  global_role_id: string | null;
  last_login_at:  string | null;
  roles:          UserModuleRoleBrief[];
}

export interface UsersFilter extends PaginationParams {
  is_active?:     boolean;
  is_superadmin?: boolean;
}

export interface AdminCreateUserDto {
  first_name:      string;
  last_name:       string;
  email:           string;
  is_superadmin?:  boolean;
  global_role_id?: string;
}

export interface AdminUpdateUserDto {
  first_name?:     string;
  last_name?:      string;
  phone?:          string;
  username?:       string;
  job_title?:      string;
  department?:     string;
  primary_sede?:   string;
  address?:        string;
  is_superadmin?:  boolean;
  is_active?:      boolean;
  global_role_id?: string;
}

export interface UpdateMeDto {
  first_name?: string;
  last_name?:  string;
  phone?:      string;
  address?:    string;
  avatar_url?: string | null;
}

export interface CompleteProfileDto {
  phone:        string;
  username?:    string;
  job_title:    string;
  department:   string;
  primary_sede: string;
  address:      string;
}

export const usersService = {
  async getUsers(filter: UsersFilter = {}): Promise<PaginatedResponse<UserListItem>> {
    const { data } = await api.get('/users', { params: filter });
    return data;
  },

  async getMe(): Promise<CurrentUser> {
    const { data } = await api.get('/users/me');
    return data;
  },

  async updateMe(payload: UpdateMeDto): Promise<CurrentUser> {
    const { data } = await api.patch('/users/me', payload);
    return data;
  },

  async completeProfile(payload: CompleteProfileDto): Promise<CurrentUser> {
    const { data } = await api.patch('/users/me/complete-profile', payload);
    return data;
  },

  async changeMyPassword(currentPassword: string, newPassword: string): Promise<void> {
    await api.patch('/users/me/password', {
      current_password: currentPassword,
      new_password:     newPassword,
    });
  },

  async getUser(id: string): Promise<CurrentUser> {
    const { data } = await api.get(`/users/${id}`);
    return data;
  },

  async createUser(payload: AdminCreateUserDto): Promise<User> {
    const { data } = await api.post('/users', payload);
    return data;
  },

  async updateUser(id: string, payload: AdminUpdateUserDto): Promise<User> {
    const { data } = await api.patch(`/users/${id}`, payload);
    return data;
  },

  async deleteUser(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async getModuleUsers(moduleId: string): Promise<Array<User & { role_name: string }>> {
    const { data } = await api.get(`/users/module/${moduleId}`);
    return data;
  },

  async getGlobalRoles(): Promise<GlobalRole[]> {
    const { data } = await api.get('/users/global-roles');
    return data;
  },

  async createGlobalRole(name: string, description?: string): Promise<GlobalRole> {
    const { data } = await api.post('/users/global-roles', { name, description });
    return data;
  },

  async deleteGlobalRole(id: string): Promise<void> {
    await api.delete(`/users/global-roles/${id}`);
  },

  async reactivateGlobalRole(id: string): Promise<GlobalRole> {
    const { data } = await api.patch(`/users/global-roles/${id}/reactivate`);
    return data;
  },

  async getMySessions(): Promise<Array<{
    id:           string;
    ip_address:   string | null;
    user_agent:   string | null;
    expires_at:   string;
    ended_at:     string | null;
    created_at:   string;
    is_active:    boolean;
  }>> {
    const { data } = await api.get('/users/me/sessions');
    return data;
  },

  async getMyActivity(): Promise<{ day: string; count: number }[]> {
    const { data } = await api.get('/users/me/activity');
    return data;
  },

  async assignUserRole(userId: string, moduleId: string, roleId: string): Promise<UserModuleRole> {
    const { data } = await api.post(`/users/${userId}/roles`, {
      module_id: moduleId,
      role_id:   roleId,
    });
    return data;
  },

  async bulkAssignToModule(
    moduleId: string,
    assignments: Array<{ user_id: string; role_id: string }>,
  ): Promise<void> {
    await api.post(`/users/module/${moduleId}/bulk-assign`, { assignments });
  },

};
