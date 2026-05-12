'use client';

import { useUIStore } from '@/stores/ui.store';
import { AppSidebar } from './AppSidebar';
import { AppHeader } from './AppHeader';
import { ForcePwModal } from './ForcePwModal';
import styles from './layout.module.css';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const expanded = useUIStore((s) => s.sidebarExpanded);

  return (
    <div className={`${styles.shell}${expanded ? ` ${styles.expanded}` : ''}`}>
      <ForcePwModal />
      <AppSidebar />
      <AppHeader />
      <main className={styles.main}>{children}</main>
    </div>
  );
}
