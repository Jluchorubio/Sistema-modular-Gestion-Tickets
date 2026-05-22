import api from './api';

export type TicketPriority = 'baja' | 'media' | 'alta' | 'critica';
export type TicketUrgency  = 'baja' | 'media' | 'alta';
export type TicketImpact   = 'bajo' | 'medio' | 'alto';
export type SlaStatus      = 'active' | 'paused' | 'met' | 'breached';

export interface TicketCategory {
  id:        string;
  name:      string;
  parent_id: string | null;
}

export interface TicketEnvironment {
  id:            string;
  name:          string;
  location_name: string | null;
}

export interface TicketState {
  id:         string;
  name:       string;
  label:      string;
  is_initial: boolean;
  is_final:   boolean;
}

export interface TicketTransition {
  id:            string;
  name:          string;
  from_state_id: string;
  to_state_id:   string;
  to_label:      string;
  to_name:       string;
}

export interface TicketModuleWorkflow {
  workflow:    { id: string; version: number; description: string };
  states:      TicketState[];
  transitions: TicketTransition[];
}

export interface TicketListItem {
  id:                   string;
  title:                string;
  priority:             TicketPriority;
  urgency:              TicketUrgency;
  impact:               TicketImpact;
  sla_deadline:         string | null;
  created_at:           string;
  updated_at:           string;
  module_id:            string;
  module_name:          string;
  category_id:          string;
  category_name:        string;
  environment_id:       string;
  environment_name:     string;
  current_state_id:     string;
  state_name:           string;
  state_label:          string;
  is_final:             boolean;
  created_by:           string;
  creator_name:         string;
  assignee_name:        string | null;
  sla_status:           SlaStatus | null;
  sla_deadline_tracked: string | null;
  breached_at:          string | null;
}

export interface TicketAssignment {
  id:          string;
  role:        string;
  user_id:     string;
  user_name:   string;
  is_active:   boolean;
  assigned_at: string;
}

export interface TicketHistoryEntry {
  id:               string;
  transitioned_at:  string;
  from_label:       string;
  to_label:         string;
  actor_name:       string;
  transition_reason: string | null;
}

export interface TicketDetail extends TicketListItem {
  description:         string | null;
  workflow_version_id: string;
  assignments:         TicketAssignment[];
  history:             TicketHistoryEntry[];
  transitions:         TicketTransition[];
}

export interface CreateTicketDto {
  module_id:      string;
  category_id:    string;
  environment_id: string;
  title:          string;
  description?:   string;
  priority?:      TicketPriority;
  urgency?:       TicketUrgency;
  impact?:        TicketImpact;
}

export interface TicketsFilter {
  module_id?: string;
  state_id?:  string;
  priority?:  TicketPriority | '';
  mine?:      boolean;
  page?:      number;
  limit?:     number;
}

export interface PaginatedTickets {
  data:  TicketListItem[];
  total: number;
  page:  number;
  limit: number;
}

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  baja:    'Baja',
  media:   'Media',
  alta:    'Alta',
  critica: 'Crítica',
};

export const TICKET_PRIORITY_COLORS: Record<TicketPriority, string> = {
  baja:    '#94A3B8',
  media:   '#3B82F6',
  alta:    '#F59E0B',
  critica: '#EF4444',
};

export const SLA_STATUS_COLORS: Record<SlaStatus, string> = {
  active:   '#3B82F6',
  paused:   '#94A3B8',
  met:      '#22C55E',
  breached: '#EF4444',
};

export const SLA_STATUS_LABELS: Record<SlaStatus, string> = {
  active:   'En tiempo',
  paused:   'Pausado',
  met:      'Cumplido',
  breached: 'Vencido',
};

export const ticketsService = {
  async getAll(filter: TicketsFilter = {}): Promise<PaginatedTickets> {
    const params: Record<string, string> = {};
    if (filter.module_id)            params.module_id  = filter.module_id;
    if (filter.state_id)             params.state_id   = filter.state_id;
    if (filter.priority)             params.priority   = filter.priority;
    if (filter.mine)                 params.mine       = 'true';
    if (filter.page  != null)        params.page       = String(filter.page);
    if (filter.limit != null)        params.limit      = String(filter.limit);
    const { data } = await api.get('/tickets', { params });
    return data;
  },

  async getOne(id: string): Promise<TicketDetail> {
    const { data } = await api.get(`/tickets/${id}`);
    return data;
  },

  async create(dto: CreateTicketDto): Promise<TicketListItem> {
    const { data } = await api.post('/tickets', dto);
    return data;
  },

  async transition(ticketId: string, transitionId: string, reason?: string): Promise<void> {
    await api.patch(`/tickets/${ticketId}/transition`, { transition_id: transitionId, reason });
  },

  async getCategories(moduleId: string): Promise<TicketCategory[]> {
    const { data } = await api.get('/tickets/categories', { params: { module_id: moduleId } });
    return data;
  },

  async getEnvironments(moduleId: string): Promise<TicketEnvironment[]> {
    const { data } = await api.get('/tickets/environments', { params: { module_id: moduleId } });
    return data;
  },

  async getWorkflow(moduleId: string): Promise<TicketModuleWorkflow | null> {
    const { data } = await api.get('/tickets/workflow', { params: { module_id: moduleId } });
    return data;
  },

  async addCollaborator(ticketId: string, userId: string, role: string): Promise<TicketAssignment> {
    const { data } = await api.post(`/tickets/${ticketId}/assignments`, { user_id: userId, role });
    return data;
  },
};
