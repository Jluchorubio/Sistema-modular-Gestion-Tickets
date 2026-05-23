import api from './api';

export interface Headquarter {
  id:         string;
  name:       string;
  address:    string | null;
  city:       string | null;
  country:    string;
  phone:      string | null;
  email:      string | null;
  is_active:  boolean;
  created_at: string;
}

export interface Department {
  id:          string;
  name:        string;
  description: string | null;
  is_active:   boolean;
  area_count:  number;
}

export interface Area {
  id:              string;
  name:            string;
  description:     string | null;
  department_id:   string | null;
  department_name: string | null;
}

export interface Position {
  id:          string;
  name:        string;
  level:       number;
  description: string | null;
  is_active:   boolean;
}

export interface SlaRule {
  id:                     string;
  request_type:           string | null;
  priority:               string;
  hours_to_resolve:       number;
  hours_to_first_response: number;
  is_active:              boolean;
}

export interface PriorityRule {
  id:                 string;
  request_type:       string;
  base_priority:      string;
  position_level_min: number | null;
  elevated_priority:  string | null;
  notes:              string | null;
  is_active:          boolean;
}

export interface Company {
  id:             string;
  name:           string;
  slug:           string;
  timezone:       string;
  language:       string;
  logo_url:       string | null;
  primary_color:  string | null;
  website:        string | null;
  contact_email:  string | null;
  contact_phone:  string | null;
  fiscal_id:      string | null;
  industry:       string | null;
  employee_count: number | null;
}

export interface OrgSummary {
  headquarters: number;
  departments:  number;
  areas:        number;
  positions:    number;
}

export interface BulkImportResult {
  summary: { created: number; exists: number; errors: number; total: number };
  results: { email: string; status: string; detail?: string }[];
}

export interface RequestTypeConfig {
  id:                     string;
  type_key:               string;
  label:                  string;
  description:            string | null;
  is_active:              boolean;
  requires_module:        boolean;
  allows_manual_priority: boolean;
  sort_order:             number;
}

export interface PublicCompanyInfo {
  name:          string;
  slug:          string;
  logo_url:      string | null;
  primary_color: string | null;
  timezone:      string;
  language:      string;
}

const BASE = '/system-config';

export const systemConfigService = {
  /* ── Company ── */
  getCompany: () => api.get<Company>(`${BASE}/company`).then(r => r.data),
  updateCompany: (dto: Partial<Company>) => api.patch<Company>(`${BASE}/company`, dto).then(r => r.data),

  /* ── Org summary ── */
  getOrgSummary: () => api.get<OrgSummary>(`${BASE}/org/summary`).then(r => r.data),

  /* ── Headquarters ── */
  getHeadquarters: () => api.get<Headquarter[]>(`${BASE}/headquarters`).then(r => r.data),
  createHeadquarter: (dto: Omit<Headquarter, 'id' | 'is_active' | 'created_at'>) =>
    api.post<Headquarter>(`${BASE}/headquarters`, dto).then(r => r.data),
  updateHeadquarter: (id: string, dto: Partial<Headquarter>) =>
    api.patch<Headquarter>(`${BASE}/headquarters/${id}`, dto).then(r => r.data),
  deleteHeadquarter: (id: string) => api.delete(`${BASE}/headquarters/${id}`).then(r => r.data),

  /* ── Departments ── */
  getDepartments: () => api.get<Department[]>(`${BASE}/departments`).then(r => r.data),
  createDepartment: (dto: { name: string; description?: string }) =>
    api.post<Department>(`${BASE}/departments`, dto).then(r => r.data),
  deleteDepartment: (id: string) => api.delete(`${BASE}/departments/${id}`).then(r => r.data),

  /* ── Areas ── */
  getAreas: (departmentId?: string) =>
    api.get<Area[]>(`${BASE}/areas`, { params: departmentId ? { department_id: departmentId } : {} }).then(r => r.data),
  createArea: (dto: { name: string; description?: string; department_id?: string }) =>
    api.post<Area>(`${BASE}/areas`, dto).then(r => r.data),
  deleteArea: (id: string) => api.delete(`${BASE}/areas/${id}`).then(r => r.data),

  /* ── Positions ── */
  getPositions: () => api.get<Position[]>(`${BASE}/positions`).then(r => r.data),
  createPosition: (dto: { name: string; level: number; description?: string }) =>
    api.post<Position>(`${BASE}/positions`, dto).then(r => r.data),
  deletePosition: (id: string) => api.delete(`${BASE}/positions/${id}`).then(r => r.data),

  /* ── SLA rules ── */
  getSlaRules: () => api.get<SlaRule[]>(`${BASE}/sla-rules`).then(r => r.data),
  updateSlaRule: (id: string, dto: { hours_to_resolve: number; hours_to_first_response?: number }) =>
    api.patch<SlaRule>(`${BASE}/sla-rules/${id}`, dto).then(r => r.data),

  /* ── Priority rules ── */
  getPriorityRules: () => api.get<PriorityRule[]>(`${BASE}/priority-rules`).then(r => r.data),

  /* ── Bulk import ── */
  bulkImport: (users: object[]) =>
    api.post<BulkImportResult>(`${BASE}/users/bulk-import`, { users }).then(r => r.data),

  /* ── Request types ── */
  getRequestTypes: (onlyActive = false) =>
    api.get<RequestTypeConfig[]>(`${BASE}/request-types`, { params: onlyActive ? { active: 'true' } : {} }).then(r => r.data),
  updateRequestType: (id: string, dto: Partial<Pick<RequestTypeConfig, 'label' | 'description' | 'is_active' | 'requires_module' | 'allows_manual_priority' | 'sort_order'>>) =>
    api.patch<RequestTypeConfig>(`${BASE}/request-types/${id}`, dto).then(r => r.data),

  /* ── Public company info (all authenticated users) ── */
  getPublicCompanyInfo: () =>
    api.get<PublicCompanyInfo>(`${BASE}/company/public`).then(r => r.data),

  /* ── System initialization (superadmin wizard) ── */
  initializeSystem: () =>
    api.post<{ ok: boolean }>(`${BASE}/initialize`).then(r => r.data),
};
