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
  | 'other';

export type RequestStatus = 'pending' | 'under_review' | 'approved' | 'rejected';

export interface AdmRequest {
  id:             string;
  type:           RequestType;
  status:         RequestStatus;
  title:          string;
  description:    string;
  requester_name?: string | null;
  reviewer_name?:  string | null;
  review_notes?:   string | null;
  created_at:     string;
  updated_at:     string;
}

export interface RequestsFilter {
  status?: RequestStatus | '';
  type?:   RequestType   | '';
  limit?:  number;
  page?:   number;
}

export const requestsService = {
  async getAll(filter: RequestsFilter = {}): Promise<PaginatedResponse<AdmRequest>> {
    const params: Record<string, string | number> = { limit: filter.limit ?? 50 };
    if (filter.status) params.status = filter.status;
    if (filter.type)   params.type   = filter.type;
    if (filter.page)   params.page   = filter.page;
    const { data } = await api.get('/requests', { params });
    return data;
  },

  async getMine(limit = 50): Promise<PaginatedResponse<AdmRequest>> {
    const { data } = await api.get('/requests/me', { params: { limit } });
    return data;
  },

  async create(payload: { type: RequestType; title: string; description: string }): Promise<AdmRequest> {
    const { data } = await api.post('/requests', payload);
    return data;
  },

  async review(id: string, status: RequestStatus, review_notes?: string): Promise<AdmRequest> {
    const body: { status: RequestStatus; review_notes?: string } = { status };
    if (review_notes) body.review_notes = review_notes;
    const { data } = await api.patch(`/requests/${id}/review`, body);
    return data;
  },
};
