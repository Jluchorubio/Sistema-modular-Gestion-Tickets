import api from './api';

export interface SlaSummary {
  total:          string;
  without_sla:    string;
  breached:       string;
  compliant:      string;
  compliance_pct: string | null;
}

export interface SlaByPriority {
  priority:       string;
  total:          string;
  breached:       string;
  avg_sla_hours:  string | null;
}

export interface SlaMetrics {
  summary:     SlaSummary;
  by_priority: SlaByPriority[];
}

export interface TicketTotals {
  total:       string;
  open:        string;
  closed:      string;
  last_7_days: string;
}

export interface TicketByState {
  state_name:  string;
  state_label: string;
  is_final:    boolean;
  total:       string;
}

export interface TicketByPriority {
  priority: string;
  total:    string;
}

export interface DailyTrend {
  day:     string;
  created: string;
}

export interface TicketsSummary {
  totals:      TicketTotals;
  by_state:    TicketByState[];
  by_priority: TicketByPriority[];
  daily_trend: DailyTrend[];
}

export interface AuditEntry {
  id:          string;
  action:      string;
  entity_type: string;
  entity_id:   string;
  ip_address:  string | null;
  created_at:  string;
  actor_name:  string | null;
  actor_email: string | null;
}

export interface AuditKpis {
  total_today:   string;
  critical_today: string;
  config_changes: string;
  auth_events:    string;
  role_changes:   string;
}

export interface AuditUserActivity {
  actor_id:       string | null;
  actor_name:     string;
  actor_email:    string | null;
  action_count:   string;
  today_count:    string;
  last_action_at: string;
}

export interface AuditFilters {
  limit?:      number;
  actorId?:    string;
  action?:     string;
  entityType?: string;
  dateFrom?:   string;
  dateTo?:     string;
}

export interface InventoryTotals {
  total:         string;
  disponible:    string;
  asignado:      string;
  en_reparacion: string;
  dado_de_baja:  string;
  added_last_30: string;
}

export interface InventoryByCategory {
  category_name: string;
  total:         string;
  disponible:    string;
  asignado:      string;
}

export interface InventorySummary {
  totals:      InventoryTotals;
  by_category: InventoryByCategory[];
}

export interface HelpdeskKpis {
  total:                    string;
  open:                     string;
  closed:                   string;
  today:                    string;
  this_week:                string;
  this_month:               string;
  rechazados:               string;
  avg_resolution_hours:     string | null;
  avg_open_age_hours:       string | null;
  avg_first_response_hours: string | null;
  breach_active:            string;
  reopen_count:             string;
  escalation_rate:          number | null;
}

export interface HelpdeskByPriority {
  priority: string;
  total:    string;
  open:     string;
  closed:   string;
  breached: string;
}

export interface HelpdeskByCategory {
  category_name: string;
  total:         string;
  closed:        string;
  open:          string;
}

export interface HelpdeskTechnician {
  technician_id:        string;
  technician_name:      string;
  tickets_assigned:     string;
  tickets_resolved:     string;
  rechazados:           string;
  avg_resolution_hours: string | null;
  avg_assignment_hours: string | null;
  avg_rating:           string | null;
  total_ratings:        string;
}

export interface HelpdeskMetrics {
  kpis:           HelpdeskKpis;
  by_category:    HelpdeskByCategory[];
  by_priority:    HelpdeskByPriority[];
  by_technician:  HelpdeskTechnician[];
  sla:            SlaMetrics;
  daily_trend:    DailyTrend[];
}

export const reportingService = {
  async getSlaMetrics(moduleId?: string, dateFrom?: string, dateTo?: string): Promise<SlaMetrics> {
    const params: Record<string, string> = {};
    if (moduleId) params.moduleId = moduleId;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    const { data } = await api.get('/reporting/sla', { params });
    return data;
  },

  async getTicketsSummary(moduleId?: string, dateFrom?: string, dateTo?: string): Promise<TicketsSummary> {
    const params: Record<string, string> = {};
    if (moduleId) params.moduleId = moduleId;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo)   params.dateTo   = dateTo;
    const { data } = await api.get('/reporting/tickets', { params });
    return data;
  },

  async getInventorySummary(moduleId?: string): Promise<InventorySummary> {
    const params: Record<string, string> = {};
    if (moduleId) params.moduleId = moduleId;
    const { data } = await api.get('/reporting/inventory', { params });
    return data;
  },

  async getAuditLog(limit = 100, entityType?: string): Promise<AuditEntry[]> {
    const params: Record<string, string | number> = { limit };
    if (entityType) params.entity_type = entityType;
    const { data } = await api.get('/reporting/audit', { params });
    return data;
  },

  async getAuditLogFiltered(filters: AuditFilters): Promise<AuditEntry[]> {
    const params: Record<string, string | number> = { limit: filters.limit ?? 100 };
    if (filters.actorId)    params.actor_id    = filters.actorId;
    if (filters.action)     params.action      = filters.action;
    if (filters.entityType) params.entity_type = filters.entityType;
    if (filters.dateFrom)   params.dateFrom    = filters.dateFrom;
    if (filters.dateTo)     params.dateTo      = filters.dateTo;
    const { data } = await api.get('/reporting/audit', { params });
    return data;
  },

  async getAuditKpis(): Promise<AuditKpis> {
    const { data } = await api.get('/reporting/audit/kpis');
    return data;
  },

  async getAuditUserActivity(limit = 15): Promise<AuditUserActivity[]> {
    const { data } = await api.get('/reporting/audit/activity', { params: { limit } });
    return data;
  },

  async getHelpdeskMetrics(moduleId: string): Promise<HelpdeskMetrics> {
    const { data } = await api.get('/reporting/helpdesk', { params: { moduleId } });
    return data;
  },
};
