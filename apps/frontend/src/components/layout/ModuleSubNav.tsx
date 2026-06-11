'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth.store';
import { useModules } from '@/hooks/useModules';
import { HELPDESK_OPERATIONAL_NAV, isHelpdeskModule } from '@/app/(app)/tickets/_nav';
import type { ModuleNavItem } from '@/types/nav.types';
import styles from './module-subnav.module.css';

const HELPDESK_PREFIXES = ['/helpdesk', '/tickets'];

export function ModuleSubNav() {
  const pathname   = usePathname();
  const user       = useAuthStore((s) => s.user);
  const { modules } = useModules();

  const isHelpdesk = HELPDESK_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  const helpdeskId = modules?.find(isHelpdeskModule)?.id;

  const moduleRole = useMemo(() => {
    if (!user || !helpdeskId) return null;
    return user.module_roles.find(
      (r) => r.module_id === helpdeskId && r.status === 'active',
    )?.role_name ?? null;
  }, [user, helpdeskId]);

  const isSuperadmin = user?.is_superadmin ?? false;

  const visibleItems = useMemo(() =>
    HELPDESK_OPERATIONAL_NAV.filter((item) => {
      if (isSuperadmin) return true;
      if (!moduleRole) return false;
      if (!item.allowedRoles) return true;
      return item.allowedRoles.includes(moduleRole);
    }),
  [isSuperadmin, moduleRole]);

  if (!isHelpdesk || visibleItems.length === 0) return null;

  function isActive(item: ModuleNavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + '/');
  }

  function renderItem(item: ModuleNavItem) {
    const active = isActive(item);
    return (
      <Link
        key={item.key}
        href={item.href}
        className={`${styles.navItem}${active ? ` ${styles.active}` : ''}`}
        aria-current={active ? 'page' : undefined}
      >
        <item.Icon className={styles.icon} aria-hidden="true" />
        <span>{item.label}</span>
      </Link>
    );
  }

  return (
    <nav className={styles.subnav} aria-label="Navegación operacional">
      {visibleItems.map(renderItem)}
    </nav>
  );
}
