import api from './api';
import type { CriticalAuthData } from '@/hooks/useCriticalChange';

function criticalHeaders(auth?: CriticalAuthData) {
  return auth ? { 'X-Critical-Auth': JSON.stringify(auth) } : {};
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
  id:            string;
  name:          string;
  slug:          string;
  timezone:      string;
  language:      string;
  logo_url:      string | null;
  primary_color: string | null;
  website:       string | null;
  contact_email: string | null;
  contact_phone: string | null;
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
  is_active?:  boolean;
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

export interface StructureType {
  id:             string;
  name:           string;
  slug:           string;
  description:    string | null;
  weight:         number;
  parent_type_id: string | null;
  allows_users:   boolean;
  is_active:      boolean;
  sort_order:     number;
  icon:           string | null;
  color:          string | null;
}

export interface OrgNode {
  id:          string;
  type_id:     string;
  type_name:   string;
  type_slug:   string;
  parent_id:   string | null;
  parent_name: string | null;
  name:        string;
  code:        string | null;
  description: string | null;
  weight:      number;
  address:     string | null;
  city:        string | null;
  country:     string | null;
  phone:       string | null;
  email:       string | null;
  is_active:   boolean;
  sort_order:  number;
  child_count: number;
  user_count:  number;
  children?:   OrgNode[];
}

export interface PriorityFormula {
  id:                string;
  w_cargo:           number;
  w_nodo:            number;
  w_daño:            number;
  threshold_critica: number;
  threshold_alta:    number;
  threshold_media:   number;
  description:       string | null;
  is_active:         boolean;
}

export interface PriorityPreview {
  score:         number;
  base:          number;
  priority:      'baja' | 'media' | 'alta' | 'critica';
  urgency_bonus: number;
  impact_bonus:  number;
}

export interface AuditLog {
  id:             string;
  action:         'CREATE' | 'UPDATE' | 'DELETE';
  entity_type:    string;
  entity_id:      string | null;
  previous_value: Record<string, unknown> | null;
  new_value:      Record<string, unknown> | null;
  reason:         string;
  ip_address:     string | null;
  verified_2fa:   boolean;
  created_at:     string;
  user_name:      string;
  username:       string | null;
}

export interface PublicCompanyInfo {
  name:          string;
  slug:          string;
  logo_url:      string | null;
  primary_color: string | null;
  timezone:      string;
  language:      string;
}

export interface PasswordPolicy {
  min_length:        number;
  require_uppercase: boolean;
  require_lowercase: boolean;
  require_number:    boolean;
  require_special:   boolean;
  expiry_days:       number;
  totp_required:     boolean;
}

const BASE = '/system-config';

export const systemConfigService = {
  /* ── Company ── */
  getCompany: () => api.get<Company>(`${BASE}/company`).then(r => r.data),
  updateCompany: (dto: Partial<Company>, auth?: CriticalAuthData) =>
    api.patch<Company>(`${BASE}/company`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),
  setupCompany: (dto: Partial<Company>) =>
    api.patch<Company>(`${BASE}/company/setup`, dto).then(r => r.data),

  /* ── Password policy ── */
  getPasswordPolicy: () =>
    api.get<PasswordPolicy>(`${BASE}/password-policy`).then(r => r.data),
  updatePasswordPolicy: (dto: Partial<PasswordPolicy>, auth?: CriticalAuthData) =>
    api.patch<PasswordPolicy>(`${BASE}/password-policy`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),

  /* ── Org summary ── */
  getOrgSummary: () => api.get<OrgSummary>(`${BASE}/org/summary`).then(r => r.data),

  /* ── SLA rules ── */
  getSlaRules: () => api.get<SlaRule[]>(`${BASE}/sla-rules`).then(r => r.data),
  updateSlaRule: (id: string, dto: { hours_to_resolve: number; hours_to_first_response?: number }, auth?: CriticalAuthData) =>
    api.patch<SlaRule>(`${BASE}/sla-rules/${id}`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),

  /* ── Priority rules ── */
  getPriorityRules: () => api.get<PriorityRule[]>(`${BASE}/priority-rules`).then(r => r.data),

  /* ── Bulk import ── */
  bulkImport: (users: object[]) =>
    api.post<BulkImportResult>(`${BASE}/users/bulk-import`, { users }).then(r => r.data),

  /* ── Request types ── */
  getRequestTypes: (onlyActive = false) =>
    api.get<RequestTypeConfig[]>(`${BASE}/request-types`, { params: onlyActive ? { active: 'true' } : {} }).then(r => r.data),
  updateRequestType: (id: string, dto: Partial<Pick<RequestTypeConfig, 'label' | 'description' | 'is_active' | 'requires_module' | 'allows_manual_priority' | 'sort_order'>>, auth?: CriticalAuthData) =>
    api.patch<RequestTypeConfig>(`${BASE}/request-types/${id}`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),

  /* ── Ticket categories (public read) ── */
  getTicketCategories: () =>
    api.get<TicketCategory[]>(`${BASE}/ticket-categories`).then(r => r.data),
  getTicketCategoriesAll: () =>
    api.get<TicketCategory[]>(`${BASE}/ticket-categories/all`).then(r => r.data),
  createTicketCategory: (dto: { label: string; description?: string }) =>
    api.post<TicketCategory>(`${BASE}/ticket-categories`, dto).then(r => r.data),

  /* ── Damage types (public read, filterable by category_id) ── */
  getDamageTypes: (categoryId?: string) =>
    api.get<DamageType[]>(`${BASE}/damage-types`, { params: categoryId ? { category_id: categoryId } : {} }).then(r => r.data),
  getDamageTypesAdmin: () =>
    api.get<DamageType[]>(`${BASE}/damage-types/admin`).then(r => r.data),
  updateDamageType: (id: string, dto: { is_active?: boolean; weight?: number; label?: string }, auth?: CriticalAuthData) =>
    api.patch<DamageType>(`${BASE}/damage-types/${id}`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),
  createDamageType: (dto: { category_id: string; label: string; default_priority: string; weight: number; description?: string }) =>
    api.post<DamageType>(`${BASE}/damage-types`, dto).then(r => r.data),

  /* ── Business hours ── */
  getBusinessHours: (moduleId?: string) =>
    api.get<BusinessHour[]>(`${BASE}/business-hours`, { params: moduleId ? { module_id: moduleId } : {} }).then(r => r.data),
  upsertBusinessHour: (dto: { module_id?: string; day_of_week: number; start_time: string; end_time: string; is_active?: boolean }, auth?: CriticalAuthData) =>
    api.post<BusinessHour>(`${BASE}/business-hours`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),

  /* ── Holidays ── */
  getHolidays: (moduleId?: string) =>
    api.get<Holiday[]>(`${BASE}/holidays`, { params: moduleId ? { module_id: moduleId } : {} }).then(r => r.data),
  createHoliday: (dto: { holiday_date: string; name: string; module_id?: string }, auth?: CriticalAuthData) =>
    api.post<Holiday>(`${BASE}/holidays`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),
  deleteHoliday: (id: string, auth?: CriticalAuthData) =>
    api.delete(`${BASE}/holidays/${id}`, { headers: criticalHeaders(auth) }).then(r => r.data),
  syncColombiaHolidays: (year?: number) =>
    api.post<{ synced: number; skipped: number }>(`${BASE}/holidays/sync-colombia`, null, {
      params: year ? { year } : {},
    }).then(r => r.data),

  /* ── Ticket SLA Policies ── */
  getTicketSlaPolicies: (moduleId: string) =>
    api.get<TicketSlaPolicy[]>(`${BASE}/ticket-sla-policies`, { params: { module_id: moduleId } }).then(r => r.data),
  createTicketSlaRule: (policyId: string, dto: { name: string; priority_result: string; hours_to_resolve: number; sort_order?: number }, auth?: CriticalAuthData) =>
    api.post<TicketSlaRule>(`${BASE}/ticket-sla-policies/${policyId}/rules`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),
  updateTicketSlaRule: (ruleId: string, dto: Partial<Pick<TicketSlaRule, 'name' | 'priority_result' | 'hours_to_resolve' | 'sort_order' | 'is_active'>>, auth?: CriticalAuthData) =>
    api.patch<TicketSlaRule>(`${BASE}/ticket-sla-policies/rules/${ruleId}`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),
  deleteTicketSlaRule: (ruleId: string, auth?: CriticalAuthData) =>
    api.delete(`${BASE}/ticket-sla-policies/rules/${ruleId}`, { headers: criticalHeaders(auth) }).then(r => r.data),
  createTicketSlaCondition: (ruleId: string, dto: { field: string; operator: string; value: string; logical_group?: number }, auth?: CriticalAuthData) =>
    api.post<SlaCondition>(`${BASE}/ticket-sla-policies/rules/${ruleId}/conditions`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),
  deleteTicketSlaCondition: (condId: string, auth?: CriticalAuthData) =>
    api.delete(`${BASE}/ticket-sla-policies/conditions/${condId}`, { headers: criticalHeaders(auth) }).then(r => r.data),

  /* ── Public company info (all authenticated users) ── */
  getPublicCompanyInfo: () =>
    api.get<PublicCompanyInfo>(`${BASE}/company/public`).then(r => r.data),

  /* ── System initialization (superadmin wizard) ── */
  initializeSystem: () =>
    api.post<{ ok: boolean }>(`${BASE}/initialize`).then(r => r.data),

  /* ── Dynamic org: structure types ── */
  getStructureTypes: (onlyActive = false) =>
    api.get<StructureType[]>(`${BASE}/org/structure-types`, { params: onlyActive ? { active: 'true' } : {} }).then(r => r.data),
  createStructureType: (dto: Omit<StructureType, 'id' | 'is_active'>) =>
    api.post<StructureType>(`${BASE}/org/structure-types`, dto).then(r => r.data),
  updateStructureType: (id: string, dto: Partial<Pick<StructureType, 'name' | 'description' | 'weight' | 'parent_type_id' | 'allows_users' | 'is_active' | 'sort_order' | 'icon' | 'color'>>) =>
    api.patch<StructureType>(`${BASE}/org/structure-types/${id}`, dto).then(r => r.data),
  deleteStructureType: (id: string) =>
    api.delete<{ ok: boolean; message: string }>(`${BASE}/org/structure-types/${id}`).then(r => r.data),

  /* ── Dynamic org: nodes ── */
  getOrgNodesBySlug: (slug: string) =>
    api.get<{ id: string; name: string; parent_id: string | null; parent_name: string | null }[]>(
      `${BASE}/org/nodes/by-slug`, { params: { slug } },
    ).then(r => r.data),
  getOrgNodes: (params?: { type_id?: string; parent_id?: string; active?: boolean }) =>
    api.get<OrgNode[]>(`${BASE}/org/nodes`, { params }).then(r => r.data),
  getOrgNodeTree: () =>
    api.get<OrgNode[]>(`${BASE}/org/nodes/tree`).then(r => r.data),
  createOrgNode: (dto: Partial<Omit<OrgNode, 'id' | 'type_name' | 'type_slug' | 'parent_name' | 'child_count' | 'user_count' | 'children'>> & { type_id: string; name: string }) =>
    api.post<OrgNode>(`${BASE}/org/nodes`, dto).then(r => r.data),
  updateOrgNode: (id: string, dto: Partial<Omit<OrgNode, 'id' | 'type_id' | 'type_name' | 'type_slug' | 'parent_name' | 'child_count' | 'user_count' | 'children'>>) =>
    api.patch<OrgNode>(`${BASE}/org/nodes/${id}`, dto).then(r => r.data),
  deleteOrgNode: (id: string) =>
    api.delete(`${BASE}/org/nodes/${id}`).then(r => r.data),

  /* ── Priority formula ── */
  getPriorityFormula: () =>
    api.get<PriorityFormula>(`${BASE}/priority-formula`).then(r => r.data),
  updatePriorityFormula: (dto: Partial<Omit<PriorityFormula, 'id' | 'is_active'>>, auth?: CriticalAuthData) =>
    api.patch<PriorityFormula>(`${BASE}/priority-formula`, dto, { headers: criticalHeaders(auth) }).then(r => r.data),
  previewPriority: (dto: { peso_cargo: number; peso_nodo: number; peso_daño: number; urgency?: string; impact?: string }) =>
    api.post<PriorityPreview>(`${BASE}/priority-formula/preview`, dto).then(r => r.data),

  /* ── Audit logs ── */
  getAuditLogs: (params?: { limit?: number; offset?: number; entity_type?: string; entity_id?: string; user_id?: string }) =>
    api.get<AuditLog[]>(`${BASE}/audit-logs`, { params }).then(r => r.data),
};
