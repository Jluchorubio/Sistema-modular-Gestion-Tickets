'use client';

import { useUIStore } from '@/stores/ui.store';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoadPermissions } from '@/hooks/usePermission';
import { ADMIN_ROLES } from '@/constants/roles';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { ForcePwModal } from './ForcePwModal';
import styles from './layout.module.css';

function hasAdminAccess(user: { is_superadmin?: boolean; module_roles?: { status: string; role_name: string }[] } | null): boolean {
  if (!user) return false;
  if (user.is_superadmin) return true;
  const roles = user.module_roles?.filter((r) => r.status === 'active').map((r) => r.role_name) ?? [];
  return roles.some((r) => (ADMIN_ROLES as string[]).includes(r));
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const expanded = useUIStore((s) => s.sidebarExpanded);
  useHeartbeat();
  useLoadPermissions();

  const { user, isLoading } = useCurrentUser();

  // Wait for first user fetch to avoid layout flash (admin vs user shell)
  if (isLoading) {
    return <div style={{ minHeight: '100vh', background: '#F8FAFC' }} />;
  }

  const isAdmin = hasAdminAccess(user);

  if (!isAdmin) {
    return (
      <div className={styles.shellUser}>
        <ForcePwModal />
        <AppHeader noSidebar />
        <main className={styles.mainUser}>{children}</main>
      </div>
    );
  }

  return (
    <div className={`${styles.shell}${expanded ? ` ${styles.expanded}` : ''}`}>
      <ForcePwModal />
      <AppSidebar />
      <AppHeader />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
