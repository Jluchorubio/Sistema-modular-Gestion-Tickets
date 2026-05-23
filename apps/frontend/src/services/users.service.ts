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
  first_name?:              string;
  last_name?:               string;
  phone_prefix?:            string;
  phone?:                   string;
  username?:                string;
  job_title?:               string;
  department?:              string;
  primary_sede?:            string;
  address?:                 string;
  country?:                 string;
  state_province?:          string;
  city?:                    string;
  birth_date?:              string;
  national_id?:             string;
  gender?:                  string;
  emergency_contact_name?:  string;
  emergency_contact_phone?: string;
  is_superadmin?:           boolean;
  is_active?:               boolean;
  global_role_id?:          string;
}

export interface UpdateMeDto {
  first_name?:              string;
  last_name?:               string;
  phone_prefix?:            string;
  phone?:                   string;
  username?:                string;
  address?:                 string;
  country?:                 string;
  state_province?:          string;
  city?:                    string;
  birth_date?:              string;
  national_id?:             string;
  gender?:                  string;
  emergency_contact_name?:  string;
  emergency_contact_phone?: string;
  job_title?:               string;
  department?:              string;
  primary_sede?:            string;
  avatar_url?:              string | null;
}

export interface CompleteProfileDto {
  phone:          string;
  username?:      string;
  job_title:      string;
  department:     string;
  primary_sede:   string;
  address:        string;
  phone_prefix?:  string;
  country?:       string;
  state_province?: string;
  city?:          string;
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

  async getMySessions(): Promise<{
    sessions: Array<{
      id:                string;
      ip_address:        string | null;
      user_agent:        string | null;
      expires_at:        string;
      ended_at:          string | null;
      created_at:        string;
      geo_city:          string | null;
      geo_country:       string | null;
      geo_country_code:  string | null;
      geo_lat:           number | null;
      geo_lon:           number | null;
      is_active:         boolean;
    }>;
    is_online:     boolean;
    last_seen_at:  string | null;
  }> {
    const { data } = await api.get('/users/me/sessions');
    return data;
  },

  async getMyActivity(): Promise<{ day: string; count: number }[]> {
    const { data } = await api.get('/users/me/activity');
    return data;
  },

  async getMyRecentTickets(limit = 6): Promise<{
    id: string; title: string; priority: string;
    created_at: string; updated_at: string;
    module_name: string; module_slug: string | null;
    state_label: string; state_name: string; is_final: boolean;
    sla_status: string | null; sla_deadline_tracked: string | null;
  }[]> {
    const { data } = await api.get('/users/me/recent-tickets', { params: { limit } });
    return data;
  },

  async getMyAssignedTickets(limit = 50): Promise<{
    id: string; title: string; priority: string;
    created_at: string; updated_at: string;
    module_name: string; module_slug: string | null;
    state_label: string; state_name: string; is_final: boolean;
    sla_status: string | null; sla_deadline_tracked: string | null;
    assignment_role: string;
  }[]> {
    const { data } = await api.get('/users/me/assigned-tickets', { params: { limit } });
    return data;
  },

  async getUserRecentTickets(userId: string, limit = 6): Promise<{
    id: string; title: string; priority: string; created_at: string;
    module_name: string; state_label: string; state_name: string; is_final: boolean;
  }[]> {
    const { data } = await api.get(`/users/${userId}/recent-tickets`, { params: { limit } });
    return data;
  },

  async getMyActivityFeed(): Promise<{
    type: string; title: string; context: string; meta: string; ts: string;
  }[]> {
    const { data } = await api.get('/users/me/activity-feed');
    return data;
  },

  async getUserActivityFeed(userId: string): Promise<{
    type: string; title: string; context: string; meta: string; ts: string;
  }[]> {
    const { data } = await api.get(`/users/${userId}/activity-feed`);
    return data;
  },

  async getMyRequestStats(): Promise<{
    tickets_total: number; requests_total: number; requests_by_status: Record<string, number>;
  }> {
    const { data } = await api.get('/users/me/request-stats');
    return data;
  },

  async getUserRequestStats(userId: string): Promise<{
    tickets_total: number; requests_total: number; requests_by_status: Record<string, number>;
  }> {
    const { data } = await api.get(`/users/${userId}/request-stats`);
    return data;
  },

  async getUserRoles(userId: string): Promise<UserModuleRole[]> {
    const { data } = await api.get(`/users/${userId}/roles`);
    return data;
  },

  async assignUserRole(userId: string, moduleId: string, roleId: string): Promise<UserModuleRole> {
    const { data } = await api.post(`/users/${userId}/roles`, {
      module_id: moduleId,
      role_id:   roleId,
    });
    return data;
  },

  async removeRole(userId: string, umrId: string): Promise<void> {
    await api.delete(`/users/${userId}/roles/${umrId}`);
  },

  async getSystemStats(): Promise<{
    users:    { total: number; active: number; inactive: number };
    modules:  { total: number; active: number; inactive: number };
    tickets:  { total: number; open: number };
    requests: { total: number; pending: number; in_progress: number };
  }> {
    const { data } = await api.get('/users/stats');
    return data;
  },

  async bulkAssignToModule(
    moduleId: string,
    userIds: string[],
    roleId: string,
  ): Promise<void> {
    await api.post(`/users/module/${moduleId}/bulk-assign`, { user_ids: userIds, role_id: roleId });
  },

  async bulkImport(
    rows: { first_name: string; last_name: string; email: string; username?: string; is_superadmin?: boolean }[],
  ): Promise<{ created: number; failed: { row: number; email: string; error: string }[]; total: number }> {
    const { data } = await api.post('/users/bulk-import', { rows });
    return data;
  },

  async bulkImportAndAssign(
    moduleId: string,
    payload: {
      rows:    { first_name: string; last_name: string; email: string; username?: string }[];
      role_id: string;
    },
  ): Promise<{
    created:  number;
    existing: number;
    assigned: number;
    failed:   { row: number; email: string; error: string }[];
    total:    number;
  }> {
    const { data } = await api.post(`/users/module/${moduleId}/bulk-import-assign`, payload);
    return data;
  },

};

export interface TrashItem {
  id:                       string;
  display_name:             string;
  item_type:                string;
  deleted_at:               string;
  scheduled_hard_delete_at: string | null;
  days_remaining:           number | null;
  extra:                    string | null;
}

export const adminService = {
  async getModuleTrash(moduleId: string, itemType = 'request'): Promise<{ data: TrashItem[]; meta: { total: number } }> {
    const { data } = await api.get('/admin/trash', { params: { type: itemType, moduleId } });
    return data;
  },

  async restoreItems(type: string, ids: string[]): Promise<{ restored: number }> {
    const { data } = await api.post('/admin/trash/restore', { type, ids });
    return data;
  },

  async permanentDelete(type: string, ids: string[]): Promise<{ deleted: number }> {
    const { data } = await api.delete('/admin/trash/permanent', { data: { type, ids } });
    return data;
  },
};
