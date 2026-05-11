'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Users,
  Tag,
  ClipboardList,
  Trash2,
  User,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import styles from './sidebar.module.css';

const NAV = [
  { key: 'modules',  label: 'Módulos',        Icon: LayoutGrid,   href: '/dashboard', adminOnly: false },
  { key: 'users',    label: 'Usuarios',        Icon: Users,        href: '/users',     adminOnly: true  },
  { key: 'roles',    label: 'Roles Globales',  Icon: Tag,          href: '/roles',     adminOnly: true  },
  { key: 'requests', label: 'Solicitudes',     Icon: ClipboardList,href: '/requests',  adminOnly: false },
  { key: 'calendar', label: 'Calendario',      Icon: CalendarDays, href: '/calendar',  adminOnly: false },
  { key: 'trash',    label: 'Papelera',        Icon: Trash2,       href: '/trash',     adminOnly: true  },
];

export function AppSidebar() {
  const expanded      = useUIStore((s) => s.sidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const pathname      = usePathname();
  const isSA          = useAuthStore((s) => s.user?.is_superadmin ?? false);

  const visibleNav = NAV.filter((item) => !item.adminOnly || isSA);

  return (
    <aside className={`${styles.sidebar}${expanded ? ` ${styles.expanded}` : ''}`}>
      <div className={styles.brand} aria-label="Tickets System">
        <div className={styles.brandMark} aria-hidden="true">
          <span className={styles.brandDot} />
        </div>
      </div>

      <nav className={styles.nav} aria-label="Panel global">
        {visibleNav.map(({ key, label, Icon, href }) => {
          const active = pathname.startsWith(href);
          return (
            <Link
              key={key}
              href={href}
              title={label}
              aria-label={label}
              className={`${styles.navItem}${active ? ` ${styles.navItemActive}` : ''}`}
            >
              <Icon className={styles.navIcon} aria-hidden="true" />
              <span className={styles.navLabel}>{label}</span>
            </Link>
          );
        })}
      </nav>

      <div className={styles.bottom}>
        <Link
          href="/profile"
          title="Mi perfil"
          aria-label="Mi perfil"
          className={`${styles.navItem}${pathname === '/profile' ? ` ${styles.navItemActive}` : ''}`}
        >
          <User className={styles.navIcon} aria-hidden="true" />
          <span className={styles.navLabel}>Mi perfil</span>
        </Link>

        <button
          type="button"
          className={styles.toggleBtn}
          title={expanded ? 'Contraer menú' : 'Expandir menú'}
          aria-label={expanded ? 'Contraer menú' : 'Expandir menú'}
          onClick={toggleSidebar}
        >
          <ChevronRight className={styles.toggleIcon} aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}
