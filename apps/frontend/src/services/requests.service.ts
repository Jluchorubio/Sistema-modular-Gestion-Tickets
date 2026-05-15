import api from './api';
import type { PaginatedResponse } from '@/types/api.types';

export type RequestType =
  | 'role_change'
  | 'module_access'
  | 'info_correction'
  | 'sede_change'
  | 'permission_adjustment'
  | 'account_issue'
  | 'reactivation'
  | 'other'
  | 'task';

export type RequestStatus =
  | 'pending'
  | 'taken'
  | 'in_progress'
  | 'completed'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'cancelled';

export type RequestPriority = 'baja' | 'media' | 'alta' | 'critica';
export type TaskSource      = 'user' | 'system';

export interface RequestTimelineEntry {
  id:         string;
  action:     string;
  old_status: RequestStatus | null;
  new_status: RequestStatus | null;
  notes:      string | null;
  actor_name: string;
  created_at: string;
}

export interface AdmRequest {
  id:              string;
  type:            RequestType;
  status:          RequestStatus;
  priority:        RequestPriority;
  task_source:     TaskSource;
  title:           string;
  description:     string;
  requester_id?:   string | null;
  requester_name?: string | null;
  reviewer_name?:  string | null;
  review_notes?:   string | null;
  reviewed_at?:    string | null;
  taken_at?:       string | null;
  taken_by_name?:  string | null;
  sla_due_at?:     string | null;
  metadata?:       Record<string, unknown> | null;
  created_at:      string;
  updated_at:      string;
}

export interface RequestsFilter {
  status?: RequestStatus | '';
  type?:   RequestType   | '';
  source?: TaskSource    | '';
  limit?:  number;
  page?:   number;
}

export const requestsService = {
  async getAll(filter: RequestsFilter = {}): Promise<PaginatedResponse<AdmRequest>> {
    const params: Record<string, string | number> = { limit: filter.limit ?? 50 };
    if (filter.status) params.status = filter.status;
    if (filter.type)   params.type   = filter.type;
    if (filter.source) params.source = filter.source;
    if (filter.page)   params.page   = filter.page;
    const { data } = await api.get('/requests', { params });
    return data;
  },

  async getMine(limit = 50): Promise<PaginatedResponse<AdmRequest>> {
    const { data } = await api.get('/requests/me', { params: { limit } });
    return data;
  },

  async create(payload: {
    type:         RequestType;
    title:        string;
    description:  string;
    priority?:    RequestPriority;
    task_source?: TaskSource;
    metadata?:    Record<string, unknown>;
  }): Promise<AdmRequest> {
    const { data } = await api.post('/requests', payload);
    return data;
  },

  async take(id: string): Promise<AdmRequest> {
    const { data } = await api.post(`/requests/${id}/take`);
    return data;
  },

  async updateProgress(id: string, status: 'in_progress' | 'completed'): Promise<AdmRequest> {
    const { data } = await api.patch(`/requests/${id}/progress`, { status });
    return data;
  },

  async completeTask(id: string): Promise<{ ok: boolean }> {
    const { data } = await api.patch(`/requests/me/${id}/complete`);
    return data;
  },

  async cancel(id: string): Promise<{ ok: boolean }> {
    const { data } = await api.delete(`/requests/me/${id}`);
    return data;
  },

  async getTimeline(id: string): Promise<RequestTimelineEntry[]> {
    const { data } = await api.get(`/requests/${id}/timeline`);
    return data;
  },

  async review(id: string, status: RequestStatus, review_notes?: string): Promise<AdmRequest> {
    const body: { status: RequestStatus; review_notes?: string } = { status };
    if (review_notes) body.review_notes = review_notes;
    const { data } = await api.patch(`/requests/${id}/review`, body);
    return data;
  },
};
