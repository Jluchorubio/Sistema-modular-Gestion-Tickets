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
  total:      string;
  open:       string;
  closed:     string;
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
  totals:       TicketTotals;
  by_state:     TicketByState[];
  by_priority:  TicketByPriority[];
  daily_trend:  DailyTrend[];
}

export interface AuditEntry {
  id:           string;
  action:       string;
  entity_type:  string;
  entity_id:    string;
  ip_address:   string | null;
  created_at:   string;
  actor_name:   string | null;
  actor_email:  string | null;
}

export interface InventoryTotals {
  total:          string;
  disponible:     string;
  asignado:       string;
  en_reparacion:  string;
  dado_de_baja:   string;
  added_last_30:  string;
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
  total:                string;
  open:                 string;
  closed:               string;
  today:                string;
  this_week:            string;
  this_month:           string;
  rechazados:           string;
  avg_resolution_hours: string | null;
}

export interface HelpdeskByCategory {
  category_name: string;
  total:         string;
  closed:        string;
  open:          string;
}

export interface HelpdeskTechnician {
  technician_id:       string;
  technician_name:     string;
  tickets_assigned:    string;
  tickets_resolved:    string;
  rechazados:          string;
  avg_resolution_hours: string | null;
  avg_rating:          string | null;
  total_ratings:       string;
}

export interface HelpdeskMetrics {
  kpis:           HelpdeskKpis;
  by_category:    HelpdeskByCategory[];
  by_technician:  HelpdeskTechnician[];
  sla:            SlaMetrics;
  daily_trend:    DailyTrend[];
}

export const reportingService = {
  async getSlaMetrics(moduleId?: string): Promise<SlaMetrics> {
    const params: Record<string, string> = {};
    if (moduleId) params.moduleId = moduleId;
    const { data } = await api.get('/reporting/sla', { params });
    return data;
  },

  async getTicketsSummary(moduleId?: string): Promise<TicketsSummary> {
    const params: Record<string, string> = {};
    if (moduleId) params.moduleId = moduleId;
    const { data } = await api.get('/reporting/tickets', { params });
    return data;
  },

  async getInventorySummary(moduleId?: string): Promise<InventorySummary> {
    const params: Record<string, string> = {};
    if (moduleId) params.moduleId = moduleId;
    const { data } = await api.get('/reporting/inventory', { params });
    return data;
  },

  async getAuditLog(limit = 50, entityType?: string): Promise<AuditEntry[]> {
    const params: Record<string, string | number> = { limit };
    if (entityType) params.entity_type = entityType;
    const { data } = await api.get('/reporting/audit', { params });
    return data;
  },

  async getHelpdeskMetrics(moduleId: string): Promise<HelpdeskMetrics> {
    const { data } = await api.get('/reporting/helpdesk', { params: { moduleId } });
    return data;
  },

  exportTicketsCsvUrl(moduleId?: string): string {
    const base = (api.defaults.baseURL ?? '') + '/reporting/export/tickets';
    return moduleId ? `${base}?moduleId=${moduleId}` : base;
  },
};
