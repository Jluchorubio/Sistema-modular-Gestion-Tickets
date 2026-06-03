'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { HELPDESK_OPERATIONAL_NAV } from '@/app/(app)/tickets/_nav';
import type { ModuleNavItem } from '@/types/nav.types';
import styles from './module-subnav.module.css';

const HELPDESK_PREFIXES = ['/helpdesk', '/tickets'];

export function ModuleSubNav() {
  const pathname = usePathname();

  const isHelpdesk = HELPDESK_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );

  if (!isHelpdesk) return null;

  function isActive(href: string, key?: string) {
    if (key === 'inicio') return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  function renderItem(item: ModuleNavItem) {
    const active = isActive(item.href, item.key);
    const link = (
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
    return item.permKey
      ? <PermissionGate key={item.key} perm={item.permKey}>{link}</PermissionGate>
      : link;
  }

  return (
    <nav className={styles.subnav} aria-label="Navegación operacional">
      {HELPDESK_OPERATIONAL_NAV.map(renderItem)}
    </nav>
  );
}
