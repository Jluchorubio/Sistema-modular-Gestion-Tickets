import type { ModuleRole } from '@/constants/roles';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone_prefix: string | null;
  phone: string | null;
  username: string | null;
  job_title: string | null;
  department: string | null;
  address: string | null;
  country: string | null;
  state_province: string | null;
  city: string | null;
  birth_date: string | null;
  national_id: string | null;
  gender: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  primary_sede: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
  is_active: boolean;
  profile_complete: boolean;
  force_password_change: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface UserModuleRole {
  umr_id: string;
  module_id: string;
  module_name: string;
  role_name: ModuleRole;
  status: 'active' | 'inactive';
  assigned_at: string;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  notifications_enabled: boolean;
  theme: 'light' | 'dark' | 'system';
}

export interface CurrentUser extends User {
  module_roles:  UserModuleRole[];
  preferences:   UserPreferences | null;
  otp_enabled?:  boolean;
  totp_enabled?: boolean;
}

export interface GlobalRole {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  user_count?: number;
  created_at: string;
  deleted_at: string | null;
}

export type AvailabilityReason =
  | 'vacation'
  | 'sick_leave'
  | 'maternity_leave'
  | 'training'
  | 'other';

export interface UserAvailability {
  user_id: string;
  module_id: string;
  is_available: boolean;
  reason: AvailabilityReason | null;
  from_date: string | null;
  to_date: string | null;
}

export interface UserSkill {
  id: string;
  skill_id: string;
  skill_name: string;
  module_id: string;
  priority: number;
  max_concurrent: number;
}
