import api from './api';
import type { PaginatedResponse } from '@/types/api.types';

export type TrashType = 'all' | 'user' | 'module' | 'role' | 'request';

export interface TrashItem {
  id: string;
  item_type: 'user' | 'module' | 'role' | 'request';
  display_name: string;
  days_remaining: number;
  deleted_at: string;
  extra?: string | null;
}

export const adminService = {
  async getTrash(type: TrashType = 'all'): Promise<PaginatedResponse<TrashItem>> {
    const params: Record<string, string> = { limit: '100' };
    if (type !== 'all') params.type = type;
    const { data } = await api.get('/admin/trash', { params });
    return data;
  },

  async restore(itemType: string, id: string): Promise<void> {
    await api.post('/admin/trash/restore', { type: itemType, ids: [id] });
  },

  async permanentDelete(itemType: string, id: string): Promise<void> {
    await api.delete('/admin/trash/permanent', {
      data: { type: itemType, ids: [id] },
    });
  },

  async purgeExpired(): Promise<void> {
    await api.post('/admin/trash/purge-expired');
  },

  async bulkSoftDelete(type: string, ids: string[]): Promise<void> {
    await api.post('/admin/bulk-delete', { type, ids });
  },

  async bulkRestore(type: string, ids: string[]): Promise<void> {
    await api.post('/admin/trash/restore', { type, ids });
  },

  async bulkPermanentDelete(type: string, ids: string[]): Promise<void> {
    await api.delete('/admin/trash/permanent', { data: { type, ids } });
  },
};
