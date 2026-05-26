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

export interface TicketCategory {
  id:          string;
  slug:        string;
  label:       string;
  description: string | null;
  icon:        string | null;
  color:       string | null;
  sort_order:  number;
}

export interface DamageType {
  id:                  string;
  category_id:         string;
  category_slug:       string;
  category_label:      string;
  slug:                string;
  label:               string;
  description:         string | null;
  default_priority:    string;
  weight:              number;
  allow_freetext:      boolean;
  is_other:            boolean;
  is_active:           boolean;
  sort_order:          number;
}

export interface BusinessHour {
  id:          string;
  module_id:   string | null;
  day_of_week: number;
  start_time:  string;
  end_time:    string;
  is_active:   boolean;
}

export interface Holiday {
  id:           string;
  module_id:    string | null;
  holiday_date: string;
  name:         string;
  is_active:    boolean;
}

export interface SlaCondition {
  id:            string;
  rule_id:       string;
  field:         string;
  operator:      string;
  value:         string;
  logical_group: number;
  sort_order:    number;
}

export interface TicketSlaRule {
  id:               string;
  policy_id:        string;
  name:             string;
  priority_result:  string;
  hours_to_resolve: number;
  sort_order:       number;
  is_active:        boolean;
  conditions:       SlaCondition[];
}

export interface TicketSlaPolicy {
  id:        string;
  module_id: string;
  name:      string;
  version:   number;
  is_active: boolean;
  rules:     TicketSlaRule[];
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

  /* ── Ticket categories (public read) ── */
  getTicketCategories: () =>
    api.get<TicketCategory[]>(`${BASE}/ticket-categories`).then(r => r.data),

  /* ── Damage types (public read, filterable by category_id) ── */
  getDamageTypes: (categoryId?: string) =>
    api.get<DamageType[]>(`${BASE}/damage-types`, { params: categoryId ? { category_id: categoryId } : {} }).then(r => r.data),
  updateDamageType: (id: string, dto: { is_active?: boolean; weight?: number; label?: string }) =>
    api.patch<DamageType>(`${BASE}/damage-types/${id}`, dto).then(r => r.data),

  /* ── Business hours ── */
  getBusinessHours: (moduleId?: string) =>
    api.get<BusinessHour[]>(`${BASE}/business-hours`, { params: moduleId ? { module_id: moduleId } : {} }).then(r => r.data),
  upsertBusinessHour: (dto: { module_id?: string; day_of_week: number; start_time: string; end_time: string; is_active?: boolean }) =>
    api.post<BusinessHour>(`${BASE}/business-hours`, dto).then(r => r.data),

  /* ── Holidays ── */
  getHolidays: (moduleId?: string) =>
    api.get<Holiday[]>(`${BASE}/holidays`, { params: moduleId ? { module_id: moduleId } : {} }).then(r => r.data),
  createHoliday: (dto: { holiday_date: string; name: string; module_id?: string }) =>
    api.post<Holiday>(`${BASE}/holidays`, dto).then(r => r.data),
  deleteHoliday: (id: string) =>
    api.delete(`${BASE}/holidays/${id}`).then(r => r.data),

  /* ── Ticket SLA Policies ── */
  getTicketSlaPolicies: (moduleId: string) =>
    api.get<TicketSlaPolicy[]>(`${BASE}/ticket-sla-policies`, { params: { module_id: moduleId } }).then(r => r.data),
  createTicketSlaRule: (policyId: string, dto: { name: string; priority_result: string; hours_to_resolve: number; sort_order?: number }) =>
    api.post<TicketSlaRule>(`${BASE}/ticket-sla-policies/${policyId}/rules`, dto).then(r => r.data),
  updateTicketSlaRule: (ruleId: string, dto: Partial<Pick<TicketSlaRule, 'name' | 'priority_result' | 'hours_to_resolve' | 'sort_order' | 'is_active'>>) =>
    api.patch<TicketSlaRule>(`${BASE}/ticket-sla-policies/rules/${ruleId}`, dto).then(r => r.data),
  deleteTicketSlaRule: (ruleId: string) =>
    api.delete(`${BASE}/ticket-sla-policies/rules/${ruleId}`).then(r => r.data),
  createTicketSlaCondition: (ruleId: string, dto: { field: string; operator: string; value: string; logical_group?: number }) =>
    api.post<SlaCondition>(`${BASE}/ticket-sla-policies/rules/${ruleId}/conditions`, dto).then(r => r.data),
  deleteTicketSlaCondition: (condId: string) =>
    api.delete(`${BASE}/ticket-sla-policies/conditions/${condId}`).then(r => r.data),

  /* ── Public company info (all authenticated users) ── */
  getPublicCompanyInfo: () =>
    api.get<PublicCompanyInfo>(`${BASE}/company/public`).then(r => r.data),

  /* ── System initialization (superadmin wizard) ── */
  initializeSystem: () =>
    api.post<{ ok: boolean }>(`${BASE}/initialize`).then(r => r.data),
};
