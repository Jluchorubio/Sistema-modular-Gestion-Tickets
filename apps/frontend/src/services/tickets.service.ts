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

export interface TicketAttachment {
  id:            string;
  original_name: string;
  mime_type:     string;
  file_size:     number;
  file_url:      string;
  created_at:    string;
  uploader_name: string;
}

export type TimelineEventType = 'comment' | 'status_change' | 'assignment' | 'attachment' | 'approval';

export interface TicketTimelineEvent {
  id:         string;
  event_type: TimelineEventType;
  subtype:    string | null;
  user_id:    string | null;
  user_name:  string | null;
  avatar_url: string | null;
  content:    string | null;
  metadata:   Record<string, any> | null;
  created_at: string;
}

export interface TicketComment {
  id:           string;
  comment_type: 'internal' | 'public';
  content:      string;
  created_at:   string;
  user_id:      string;
  author_name:  string;
  avatar_url:   string | null;
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

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface TicketDetail extends TicketListItem {
  description:          string | null;
  workflow_version_id:  string;
  reprocess_count:      number;
  escalated:            boolean;
  escalation_note:      string | null;
  approval_status:      ApprovalStatus | null;
  approval_expires_at:  string | null;
  assignments:          TicketAssignment[];
  history:              TicketHistoryEntry[];
  transitions:          TicketTransition[];
}

export interface TicketAsset {
  link_id:          string;
  link_notes:       string | null;
  id:               string;
  name:             string;
  serial_number:    string | null;
  qr_code:          string;
  status:           string;
  specifications:   Record<string, unknown> | null;
  category_name:    string;
  environment_name: string;
  location_name:    string | null;
  assigned_to_name: string | null;
}

export interface AssetHistoryEntry {
  id:         string;
  action:     string;
  reason:     string | null;
  created_at: string;
  user_name:  string | null;
  actor_name: string | null;
}

export const ASSET_STATUS_COLORS: Record<string, string> = {
  disponible:    '#22C55E',
  asignado:      '#3B82F6',
  en_reparacion: '#F59E0B',
  dado_de_baja:  '#EF4444',
};

export const ASSET_STATUS_LABELS: Record<string, string> = {
  disponible:    'Disponible',
  asignado:      'Asignado',
  en_reparacion: 'En reparación',
  dado_de_baja:  'Dado de baja',
};

export const ASSET_ACTION_LABELS: Record<string, string> = {
  asignado:     'Asignado',
  devuelto:     'Devuelto',
  transferido:  'Transferido',
  dado_de_baja: 'Dado de baja',
  reparacion:   'Reparación',
};

export interface TicketRating {
  id:                        string;
  ticket_id:                 string;
  rated_by:                  string;
  technician_id:             string;
  technician_name:           string;
  score_overall:             number;
  score_attention:           number | null;
  score_clarity:             number | null;
  score_response_time:       number | null;
  score_quality:             number | null;
  service_label:             string | null;
  comment:                   string | null;
  would_recommend:           boolean | null;
  resolved_on_first_attempt: boolean | null;
  expires_at:                string;
  created_at:                string;
}

export interface RateTicketDto {
  score_overall:              number;
  score_attention?:           number;
  score_clarity?:             number;
  score_response_time?:       number;
  score_quality?:             number;
  service_label?:             'excelente' | 'bueno' | 'regular' | 'deficiente';
  comment?:                   string;
  would_recommend?:           boolean;
  resolved_on_first_attempt?: boolean;
}

export interface AssetSearchResult {
  id:               string;
  name:             string;
  serial_number:    string | null;
  qr_code:          string;
  status:           string;
  category_name:    string | null;
  environment_name: string | null;
  location_name:    string | null;
  assigned_to_name: string | null;
}

export interface CreateTicketDto {
  module_id:                  string;
  category_id:                string;
  environment_id?:            string;
  title:                      string;
  description?:               string;
  damage_type_id?:            string;
  custom_damage_description?: string;
  asset_id?:                  string;
  priority?:                  TicketPriority;
  urgency?:                   TicketUrgency;
  impact?:                    TicketImpact;
}

export interface TicketsFilter {
  module_id?:   string;
  state_id?:    string;
  priority?:    TicketPriority | '';
  mine?:        boolean;
  category_id?: string;
  assignee_id?: string;
  sla_status?:  SlaStatus | '';
  is_reproceso?: boolean;
  unassigned?:  boolean;
  page?:        number;
  limit?:       number;
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
    if (filter.module_id)             params.module_id   = filter.module_id;
    if (filter.state_id)              params.state_id    = filter.state_id;
    if (filter.priority)              params.priority    = filter.priority;
    if (filter.mine)                  params.mine        = 'true';
    if (filter.category_id)           params.category_id = filter.category_id;
    if (filter.assignee_id)           params.assignee_id = filter.assignee_id;
    if (filter.sla_status)            params.sla_status  = filter.sla_status;
    if (filter.is_reproceso)          params.is_reproceso = 'true';
    if (filter.unassigned)            params.unassigned   = 'true';
    if (filter.page  != null)         params.page        = String(filter.page);
    if (filter.limit != null)         params.limit       = String(filter.limit);
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

  async approve(ticketId: string, signature: string): Promise<{ ok: boolean }> {
    const { data } = await api.post(`/tickets/${ticketId}/approve`, { signature });
    return data;
  },

  async reject(ticketId: string, reason: string): Promise<{ ok: boolean; escalated: boolean }> {
    const { data } = await api.post(`/tickets/${ticketId}/reject`, { reason });
    return data;
  },

  async getRating(ticketId: string): Promise<TicketRating | null> {
    const { data } = await api.get(`/tickets/${ticketId}/rating`);
    return data;
  },

  async rate(ticketId: string, dto: RateTicketDto): Promise<TicketRating> {
    const { data } = await api.post(`/tickets/${ticketId}/rate`, dto);
    return data;
  },

  async getTimeline(ticketId: string): Promise<TicketTimelineEvent[]> {
    const { data } = await api.get(`/tickets/${ticketId}/timeline`);
    return data;
  },

  async getAttachments(ticketId: string): Promise<TicketAttachment[]> {
    const { data } = await api.get(`/tickets/${ticketId}/attachments`);
    return data;
  },

  async uploadAttachment(ticketId: string, file: File): Promise<TicketAttachment> {
    const form = new FormData();
    form.append('file', file);
    const { data: uploaded } = await api.post('/files/attachment', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const { data } = await api.post(`/tickets/${ticketId}/attachments`, {
      original_name: file.name,
      stored_name:   uploaded.storedName,
      mime_type:     file.type,
      file_size:     file.size,
      file_url:      uploaded.url,
    });
    return data;
  },

  async deleteAttachment(ticketId: string, attachmentId: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/tickets/${ticketId}/attachments/${attachmentId}`);
    return data;
  },

  async getComments(ticketId: string): Promise<TicketComment[]> {
    const { data } = await api.get(`/tickets/${ticketId}/comments`);
    return data;
  },

  async addComment(
    ticketId: string,
    content: string,
    commentType: 'internal' | 'public' = 'public',
  ): Promise<TicketComment> {
    const { data } = await api.post(`/tickets/${ticketId}/comments`, {
      content,
      comment_type: commentType,
    });
    return data;
  },

  async getTicketAssets(ticketId: string): Promise<TicketAsset[]> {
    const { data } = await api.get(`/tickets/${ticketId}/assets`);
    return data;
  },

  async getAssetHistory(ticketId: string, assetId: string): Promise<AssetHistoryEntry[]> {
    const { data } = await api.get(`/tickets/${ticketId}/assets/${assetId}/history`);
    return data;
  },

  async searchAssets(q: string): Promise<AssetSearchResult[]> {
    const { data } = await api.get('/tickets/asset-search', { params: { q } });
    return data;
  },

  async searchTickets(q: string, excludeId: string): Promise<{
    id: string; title: string; priority: string; state_label: string; is_final: boolean;
  }[]> {
    const { data } = await api.get('/tickets/search', { params: { q, exclude: excludeId } });
    return data;
  },

  async getRelations(ticketId: string): Promise<{
    id: string; relation_type: string; notes: string | null; created_at: string;
    created_by_name: string;
    related_id: string; related_title: string; related_priority: string;
    related_created_at: string; related_state_label: string; related_state_name: string;
    related_is_final: boolean; related_owner_name: string | null;
    related_description: string | null;
  }[]> {
    const { data } = await api.get(`/tickets/${ticketId}/relations`);
    return data;
  },

  async addRelation(ticketId: string, dto: { target_ticket_id: string; relation_type: string; notes?: string }): Promise<{ id?: string; ok?: boolean }> {
    const { data } = await api.post(`/tickets/${ticketId}/relations`, dto);
    return data;
  },

  async removeRelation(ticketId: string, relationId: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/tickets/${ticketId}/relations/${relationId}`);
    return data;
  },

  async getAssetPrevTickets(ticketId: string, assetId: string): Promise<{
    id: string; title: string; priority: string; created_at: string; updated_at: string;
    state_label: string; state_name: string; is_final: boolean;
    creator_name: string; owner_name: string | null;
  }[]> {
    const { data } = await api.get(`/tickets/${ticketId}/assets/${assetId}/prev-tickets`);
    return data;
  },

  async addAssignment(
    ticketId: string,
    userId: string,
    role: 'owner' | 'collaborator' | 'observer',
  ): Promise<{ id: string; role: string; assigned_at: string; is_active: boolean }> {
    const { data } = await api.post(`/tickets/${ticketId}/assignments`, { user_id: userId, role });
    return data;
  },
};
