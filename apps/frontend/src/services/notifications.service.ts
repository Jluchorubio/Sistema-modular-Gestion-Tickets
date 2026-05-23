import api from './api';

export interface AppNotification {
  id:         string;
  event_type: string;
  status:     'pending' | 'sent' | 'failed';
  payload:    Record<string, unknown>;
  created_at: string;
  sent_at:    string | null;
}

export interface NotificationsResponse {
  notifications: AppNotification[];
  unread_count:  number;
}

export const notificationsService = {
  async getMyNotifications(): Promise<NotificationsResponse> {
    const { data } = await api.get('/notifications/me');
    return data;
  },

  async markAsRead(id: string): Promise<void> {
    await api.patch(`/notifications/${id}/read`);
  },

  async markAllAsRead(): Promise<void> {
    await api.patch('/notifications/me/read-all');
  },
};
