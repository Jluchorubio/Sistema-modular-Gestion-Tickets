'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Users,
  Tag,
  Trash2,
  User,
  ChevronRight,
  ArrowLeft,
  BarChart2,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui.store';
import { usePermissions } from '@/hooks/usePermissions';
import { GESTION_NAV, GESTION_MODULE_NAME } from '@/app/(app)/requests/_nav';
import type { ModuleNavItem } from '@/types/nav.types';
import styles from './sidebar.module.css';

/* ── Nav definitions ───────────────────────────────────────────────────────── */

const ADMIN_NAV = [
  { key: 'reports', label: 'Reportes', Icon: BarChart2, href: '/reports' },
  { key: 'users',   label: 'Usuarios', Icon: Users,     href: '/users'   },
  { key: 'roles',   label: 'Roles',    Icon: Tag,       href: '/roles'   },
  { key: 'trash',   label: 'Papelera', Icon: Trash2,    href: '/trash'   },
] as const;

/* ── Section divider ───────────────────────────────────────────────────────── */

function SectionDivider({ label, expanded }: { label: string; expanded: boolean }) {
  return (
    <div className={styles.sectionDivider}>
      {expanded && <span className={styles.sectionLabel}>{label}</span>}
      {!expanded && <div className={styles.sectionLine} />}
    </div>
  );
}

/* ── Nav group ─────────────────────────────────────────────────────────────── */

function NavGroup({
  items,
  isActive,
}: {
  items: ReadonlyArray<{ key: string; label: string; Icon: LucideIcon; href: string }>;
  isActive: (href: string) => boolean;
}) {
  return (
    <>
      {items.map(({ key, label, Icon, href }) => (
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
  );
}

/* ── Module nav (dynamic) ──────────────────────────────────────────────────── */

function ModuleNav({
  name,
  items,
  expanded,
  isSuperadmin,
  isActive,
}: {
  name:         string;
  items:        ModuleNavItem[];
  expanded:     boolean;
  isSuperadmin: boolean;
  isActive:     (href: string) => boolean;
}) {
  const visible = items.filter((item) => !item.superadminOnly || isSuperadmin);

  return (
    <>
      <Link href="/dashboard" className={styles.moduleCtxBack} title="Volver al Dashboard">
        <ArrowLeft size={14} />
        {expanded && <span>Dashboard</span>}
      </Link>

      {expanded && (
        <div className={styles.moduleCtxName}>{name}</div>
      )}

      <SectionDivider label="MÓDULO" expanded={expanded} />

      {visible.map(({ key, label, Icon, href }) => (
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
  );
}

/* ── Main component ────────────────────────────────────────────────────────── */

export function AppSidebar() {
  const expanded      = useUIStore((s) => s.sidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const moduleNav     = useUIStore((s) => s.moduleNav);
  const moduleName    = useUIStore((s) => s.moduleName);
  const pathname      = usePathname();
  const { isSuperadmin, isModuleAdmin: isAdmin } = usePermissions();

  // Path-based nav override — avoids async race when navigating between sub-pages
  const isGestionPath = pathname.startsWith('/requests');
  const effectiveNav  = isGestionPath ? GESTION_NAV  : moduleNav;
  const effectiveName = isGestionPath ? GESTION_MODULE_NAME : (moduleName ?? '');

  function isActive(href: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    if (href === '/requests')  return pathname === '/requests';
    return pathname === href || pathname.startsWith(href + '/');
  }

  return (
    <aside className={`${styles.sidebar}${expanded ? ` ${styles.expanded}` : ''}`}>
      {/* ── Brand ── */}
      <div className={styles.brand} aria-label="Sistema de Tickets">
        <div className={styles.brandMark} aria-hidden="true">
          <span className={styles.brandDot} />
        </div>
      </div>

      {/* ── Nav ── */}
      <nav className={styles.nav} aria-label="Panel principal">
        {effectiveNav ? (
          /* ── Module context nav ── */
          <ModuleNav
            name={effectiveName}
            items={effectiveNav}
            expanded={expanded}
            isSuperadmin={isSuperadmin}
            isActive={isActive}
          />
        ) : (
          /* ── Global nav ── */
          <>
            <Link
              href="/dashboard"
              title="Dashboard"
              aria-label="Dashboard"
              className={`${styles.navItem}${isActive('/dashboard') ? ` ${styles.navItemActive}` : ''}`}
            >
              <LayoutGrid className={styles.navIcon} aria-hidden="true" />
              <span className={styles.navLabel}>Dashboard</span>
            </Link>

            {isAdmin && (
              <>
                <SectionDivider label="ADMINISTRACIÓN" expanded={expanded} />
                <NavGroup items={ADMIN_NAV} isActive={isActive} />
              </>
            )}
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
