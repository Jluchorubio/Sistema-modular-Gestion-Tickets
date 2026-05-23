import api from './api';

export type CalEventType   = 'personal' | 'module' | 'global';
export type CalVisibility  = 'private' | 'module' | 'participants' | 'global';
export type CalEventStatus = 'active' | 'completed' | 'cancelled';

export interface CalendarEvent {
  id:                string;
  title:             string;
  description:       string | null;
  event_type:        CalEventType;
  visibility:        CalVisibility;
  module_id:         string | null;
  module_name:       string | null;
  start_at:          string;
  end_at:            string;
  all_day:           boolean;
  priority:          string;
  status:            CalEventStatus;
  color:             string | null;
  source:            string;
  recurrence_rule:   string | null;
  ticket_id:         string | null;
  request_id:        string | null;
  created_at:        string;
  created_by_name:   string;
  participant_count: number;
}

export interface CreateCalendarEventDto {
  title:           string;
  description?:    string;
  event_type?:     CalEventType;
  visibility?:     CalVisibility;
  module_id?:      string;
  start_at:        string;
  end_at:          string;
  all_day?:        boolean;
  priority?:       string;
  color?:          string;
  participant_ids?: string[];
}

export const EVENT_TYPE_LABELS: Record<CalEventType, string> = {
  personal: 'Personal',
  module:   'Módulo',
  global:   'Global',
};

export const VISIBILITY_LABELS: Record<CalVisibility, string> = {
  private:      'Privado',
  module:       'Módulo',
  participants: 'Participantes',
  global:       'Global',
};

export const EVENT_COLORS: Record<string, string> = {
  '#6366f1': 'Índigo',
  '#8b5cf6': 'Violeta',
  '#ec4899': 'Rosa',
  '#ef4444': 'Rojo',
  '#f59e0b': 'Ámbar',
  '#22c55e': 'Verde',
  '#0ea5e9': 'Azul',
  '#64748b': 'Gris',
};

export const calendarEventsService = {
  async getEvents(params?: { module_id?: string; start_at?: string; end_at?: string }): Promise<CalendarEvent[]> {
    const q = new URLSearchParams();
    if (params?.module_id) q.set('module_id', params.module_id);
    if (params?.start_at)  q.set('start_at',  params.start_at);
    if (params?.end_at)    q.set('end_at',    params.end_at);
    const { data } = await api.get(`/calendar/events${q.toString() ? `?${q}` : ''}`);
    return data;
  },

  async createEvent(dto: CreateCalendarEventDto): Promise<CalendarEvent> {
    const { data } = await api.post('/calendar/events', dto);
    return data;
  },

  async updateEvent(id: string, dto: Partial<CreateCalendarEventDto> & { status?: CalEventStatus }): Promise<CalendarEvent> {
    const { data } = await api.patch(`/calendar/events/${id}`, dto);
    return data;
  },

  async deleteEvent(id: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/calendar/events/${id}`);
    return data;
  },
};
