import api from './api';

export interface AuditEntry {
  id:           string;
  action:       string;
  entity_type:  string;
  entity_id:    string;
  actor_name:   string;
  actor_email:  string | null;
  actor_type:   'user' | 'system';
  new_value:    Record<string, any> | null;
  old_value:    Record<string, any> | null;
  created_at:   string;
}

export interface AuditResponse {
  range:   { from: string; to: string; label: string };
  total:   number;
  entries: AuditEntry[];
}

export interface AuditParams {
  period?:    'day' | 'week' | 'month' | 'year';
  day?:       number;
  week?:      number;
  month?:     number;
  year?:      number;
  module_id?: string;
  actor_id?:  string;
}

// Human-readable labels for each action
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'calendar.event.created':               'Creó evento',
  'calendar.event.updated':               'Actualizó evento',
  'calendar.event.deleted':               'Eliminó evento',
  'calendar.request.approved':            'Aprobó solicitud',
  'calendar.request.rejected':            'Rechazó solicitud',
  'calendar.request.cancelled':           'Canceló solicitud',
  'calendar.request.task_completed':      'Completó tarea',
  'calendar.reminder.calendar_event':     'Recordatorio evento enviado',
  'calendar.reminder.meeting':            'Recordatorio reunión enviado',
};

// Color per action category
export const AUDIT_ACTION_COLOR: Record<string, string> = {
  'calendar.event.created':               '#8b5cf6',
  'calendar.event.updated':               '#1d4ed8',
  'calendar.event.deleted':               '#ef4444',
  'calendar.request.approved':            '#20c933',
  'calendar.request.rejected':            '#ef4444',
  'calendar.request.cancelled':           '#94a3b8',
  'calendar.request.task_completed':      '#20c933',
  'calendar.reminder.calendar_event':     '#ff5e3a',
  'calendar.reminder.meeting':            '#34a853',
};

export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  calendar_event:    'Evento',
  calendar_request:  'Solicitud',
  calendar_reminder: 'Recordatorio',
};

export const calendarAuditService = {
  async getAudit(params: AuditParams = {}): Promise<AuditResponse> {
    const q = new URLSearchParams();
    if (params.period)    q.set('period',    params.period);
    if (params.day)       q.set('day',       String(params.day));
    if (params.week)      q.set('week',      String(params.week));
    if (params.month)     q.set('month',     String(params.month));
    if (params.year)      q.set('year',      String(params.year));
    if (params.module_id) q.set('module_id', params.module_id);
    if (params.actor_id)  q.set('actor_id',  params.actor_id);
    const qs = q.toString();
    const { data } = await api.get<AuditResponse>(`/calendar/audit${qs ? `?${qs}` : ''}`);
    return data;
  },
};
