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
};
