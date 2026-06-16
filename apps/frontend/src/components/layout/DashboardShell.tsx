'use client';

import { usePathname } from 'next/navigation';
import { useUIStore } from '@/stores/ui.store';
import { useHeartbeat } from '@/hooks/useHeartbeat';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useLoadPermissions } from '@/hooks/usePermission';
import { useRealtimeNotifications } from '@/hooks/useRealtimeNotifications';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { ForcePwModal } from './ForcePwModal';
import { ModuleSubNav } from './ModuleSubNav';
import { Spinner } from '@/components/ui/Spinner';
import styles from './layout.module.css';

const MODULE_PATHS = ['/helpdesk', '/tickets', '/inventory', '/requests'];

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const expanded = useUIStore((s) => s.sidebarExpanded);
  const pathname = usePathname();
  useHeartbeat();
  useLoadPermissions();
  useRealtimeNotifications();

  const { user, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </div>
    );
  }

  const isSuperadmin  = user?.is_superadmin ?? false;
  const isAdminModulo = !!user?.module_roles?.some(
    (r) => r.role_name === 'admin_modulo' && r.status === 'active',
  );
  const isModulePath = MODULE_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  // Admin shell (sidebar): superadmin always, admin_modulo only when inside a module
  const showAdminShell = isSuperadmin || (isAdminModulo && isModulePath);

  if (!showAdminShell) {
    return (
      <div className={styles.shellUser}>
        <ForcePwModal />
        <AppHeader noSidebar />
        <main className={styles.mainUser}>
          <ModuleSubNav />
          {children}
        </main>
      </div>
    );
  }

  return (
    <div className={`${styles.shell}${expanded ? ` ${styles.expanded}` : ''}`}>
      <ForcePwModal />
      <AppSidebar />
      <AppHeader />
      <main className={styles.main}>
        <ModuleSubNav />
        {children}
      </main>
    </div>
  );
}
