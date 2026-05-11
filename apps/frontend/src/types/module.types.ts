export interface SystemModule {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string | null;
  image_url: string | null;
  color: string | null;
  is_active: boolean;
  has_access?: boolean;
  created_at: string;
  deleted_at: string | null;
}

export interface ModuleDetail extends SystemModule {
  members_count: number;
  techs_count: number;
  admins_count: number;
}

export interface Location {
  id: string;
  module_id: string;
  name: string;
  description: string | null;
  address: string | null;
  module_name?: string;
  lat?: number;
  lng?: number;
}

export interface Environment {
  id: string;
  location_id: string;
  name: string;
  description: string | null;
}

export interface ModuleMember {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url: string | null;
  role_name: string;
  status: 'active' | 'inactive';
}
