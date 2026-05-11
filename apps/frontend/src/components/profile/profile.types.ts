import type { CurrentUser, UserModuleRole } from '@/types/user.types';

export type ProfileUser = CurrentUser & {
  global_role?:           string | null;
  last_login_at?:         string | null;
  totp_enabled?:          boolean;
  notification_email?:    boolean;
  notification_in_app?:   boolean;
  notification_whatsapp?: boolean;
};

export interface ProfileViewProps {
  user:           ProfileUser;
  isOwnProfile:   boolean;
  onBack?:        () => void;
  onUserUpdated?: (u: ProfileUser) => void;
}

export type ActiveTab = 'overview' | 'security' | 'settings';

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000)    return 'Hace un momento';
  if (diff < 3_600_000) return `Hace ${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `Hace ${Math.floor(diff / 3_600_000)}h`;
  if (diff < 604_800_000) return `Hace ${Math.floor(diff / 86_400_000)} días`;
  return fmtDate(iso);
}

export const CONTRIB_COLORS = ['#EBEDF0', '#9BE9A8', '#40C463', '#30A14E', '#216E39'];

export function getActiveModules(user: ProfileUser): UserModuleRole[] {
  return (user.module_roles ?? []).filter(r => r.status === 'active');
}
