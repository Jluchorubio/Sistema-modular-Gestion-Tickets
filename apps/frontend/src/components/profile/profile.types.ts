import type { CurrentUser, UserModuleRole } from '@/types/user.types';

export type ProfileUser = CurrentUser & {
  global_role?:           string | null;
  last_login_at?:         string | null;
  totp_enabled?:          boolean;
  otp_enabled?:           boolean;
  notification_email?:    boolean;
  notification_in_app?:   boolean;
  notification_whatsapp?: boolean;
};

export interface ProfileViewProps {
  user:               ProfileUser;
  isOwnProfile:       boolean;
  viewerIsSuperadmin?: boolean;
  onBack?:            () => void;
  onUserUpdated?:     (u: ProfileUser) => void;
}

export type ActiveTab = 'overview' | 'security' | 'settings' | 'skills';

export { fmtDate, fmtRelative } from '@/lib/formatters';

export function getActiveModules(user: ProfileUser): UserModuleRole[] {
  return (user.module_roles ?? []).filter(r => r.status === 'active');
}
