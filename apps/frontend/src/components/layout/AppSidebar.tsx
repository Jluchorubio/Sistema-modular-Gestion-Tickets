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
  ArrowLeft,
  Layers,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import styles from './sidebar.module.css';

/* ── Role helpers ──────────────────────────────────────────────────────────── */

function useSidebarRoles() {
  const user = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;
  const activeRoles  = user?.module_roles?.filter((r) => r.status === 'active').map((r) => r.role_name) ?? [];
  const isAdmin      = isSuperadmin || activeRoles.includes('admin_modulo');
  const isElevated   = isAdmin      || activeRoles.includes('jefe_tecnico');
  return { isSuperadmin, isAdmin, isElevated };
}

/* ── Nav definitions ───────────────────────────────────────────────────────── */

const PERSONAL_NAV = [
  { key: 'modules',  label: 'Dashboard',    Icon: LayoutGrid,    href: '/dashboard' },
  { key: 'requests', label: 'Solicitudes',  Icon: ClipboardList, href: '/requests'  },
  { key: 'calendar', label: 'Calendario',   Icon: CalendarDays,  href: '/calendar'  },
] as const;

const ADMIN_NAV = [
  { key: 'users',  label: 'Usuarios',       Icon: Users,  href: '/users' },
  { key: 'roles',  label: 'Roles Globales', Icon: Tag,    href: '/roles' },
  { key: 'trash',  label: 'Papelera',       Icon: Trash2, href: '/trash' },
] as const;

/* ── Module context mini-header ────────────────────────────────────────────── */

function ModuleContextHeader({ expanded }: { expanded: boolean }) {
  return (
    <div className={styles.moduleCtx}>
      <Link href="/dashboard" className={styles.moduleCtxBack} title="Volver al Dashboard">
        <ArrowLeft size={14} />
        {expanded && <span>Dashboard</span>}
      </Link>
      {expanded && (
        <div className={styles.moduleCtxLabel}>
          <Layers size={11} />
          <span>Módulo activo</span>
        </div>
      )}
    </div>
  );
}

/* ── Section divider ───────────────────────────────────────────────────────── */

function SectionDivider({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <div className={styles.sectionDivider}>
      {expanded && <span className={styles.sectionLabel}>{label}</span>}
      {!expanded && <div className={styles.sectionLine} />}
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */

export function AppSidebar() {
  const expanded      = useUIStore((s) => s.sidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const pathname      = usePathname();
  const { isAdmin }   = useSidebarRoles();

  const inModule = pathname.startsWith('/modules/');

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    return pathname.startsWith(href);
  }

  return (
    <aside className={`${styles.sidebar}${expanded ? ` ${styles.expanded}` : ''}`}>
      {/* ── Brand ── */}
      <div className={styles.brand} aria-label="Tickets System">
        <div className={styles.brandMark} aria-hidden="true">
          <span className={styles.brandDot} />
        </div>
      </div>

      {/* ── Module context header ── */}
      {inModule && <ModuleContextHeader expanded={expanded} />}

      {/* ── Nav ── */}
      <nav className={styles.nav} aria-label="Panel principal">
        {/* Personal section */}
        {expanded && <span className={styles.sectionLabel} style={{ paddingLeft: 4, marginBottom: 2 }}>GENERAL</span>}
        {PERSONAL_NAV.map(({ key, label, Icon, href }) => (
          <Link
            key={key}
            href={href}
            title={label}
            aria-label={label}
            className={`${styles.navItem}${isActive(href) ? ` ${styles.navItemActive}` : ''}`}
          >
            <Icon className={styles.navIcon} aria-hidden="true" />
            <span className={styles.navLabel}>{label}</span>
          </Link>
        ))}

        {/* Admin section */}
        {isAdmin && (
          <>
            <SectionDivider label="ADMINISTRACIÓN" expanded={expanded} />
            {ADMIN_NAV.map(({ key, label, Icon, href }) => (
              <Link
                key={key}
                href={href}
                title={label}
                aria-label={label}
                className={`${styles.navItem}${isActive(href) ? ` ${styles.navItemActive}` : ''}`}
              >
                <Icon className={styles.navIcon} aria-hidden="true" />
                <span className={styles.navLabel}>{label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* ── Bottom ── */}
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
