import api from './api';

export type MeetingProvider = 'google_meet' | 'teams' | 'zoom' | 'internal';
export type MeetingStatus   = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface TicketMeeting {
  id:                string;
  provider:          MeetingProvider;
  meeting_url:       string | null;
  reason:            string;
  status:            MeetingStatus;
  scheduled_at:      string;
  duration_minutes:  number | null;
  created_at:        string;
  created_by_name:   string;
  participant_count: number;
}

export interface CalendarMeeting extends TicketMeeting {
  ticket_id:    string;
  ticket_title: string;
  module_id:    string;
  module_name:  string;
}

export interface CreateMeetingDto {
  reason:            string;
  provider:          MeetingProvider;
  meeting_url?:      string;
  scheduled_at:      string;
  duration_minutes?: number;
  participant_ids?:  string[];
}

export const PROVIDER_LABELS: Record<MeetingProvider, string> = {
  google_meet: 'Google Meet',
  teams:       'Microsoft Teams',
  zoom:        'Zoom',
  internal:    'Enlace interno',
};

export const PROVIDER_COLORS: Record<MeetingProvider, string> = {
  google_meet: '#34a853',
  teams:       '#6264a7',
  zoom:        '#2d8cff',
  internal:    '#64748b',
};

export const STATUS_LABELS: Record<MeetingStatus, string> = {
  scheduled: 'Programada',
  active:    'En curso',
  completed: 'Completada',
  cancelled: 'Cancelada',
};

export const STATUS_COLORS: Record<MeetingStatus, string> = {
  scheduled: '#6366f1',
  active:    '#22c55e',
  completed: '#64748b',
  cancelled: '#ef4444',
};

export const meetingsService = {
  async getCalendarMeetings(params?: { module_id?: string }): Promise<CalendarMeeting[]> {
    const q = params?.module_id ? `?module_id=${params.module_id}` : '';
    const { data } = await api.get(`/meetings/calendar${q}`);
    return data;
  },

  async getMeetings(ticketId: string): Promise<TicketMeeting[]> {
    const { data } = await api.get(`/tickets/${ticketId}/meetings`);
    return data;
  },

  async createMeeting(ticketId: string, dto: CreateMeetingDto): Promise<TicketMeeting> {
    const { data } = await api.post(`/tickets/${ticketId}/meetings`, dto);
    return data;
  },

  async updateMeeting(meetingId: string, dto: { status?: MeetingStatus; meeting_url?: string }): Promise<TicketMeeting> {
    const { data } = await api.patch(`/meetings/${meetingId}`, dto);
    return data;
  },

  async cancelMeeting(meetingId: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/meetings/${meetingId}`);
    return data;
  },
};
