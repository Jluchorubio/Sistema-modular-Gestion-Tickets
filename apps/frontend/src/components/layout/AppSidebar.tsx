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
  Settings2,
  type LucideIcon,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '@/stores/ui.store';
import { usePermissions } from '@/hooks/usePermissions';
import { usePermission, useHasAnyPermission } from '@/hooks/usePermission';
import { PermissionGate } from '@/components/auth/PermissionGate';
import { GESTION_NAV, GESTION_MODULE_NAME } from '@/app/(app)/requests/_nav';
import { systemConfigService } from '@/services/system-config.service';
import type { ModuleNavItem } from '@/types/nav.types';
import styles from './sidebar.module.css';

/* ── Nav definitions ───────────────────────────────────────────────────────── */

const ADMIN_NAV = [
  { key: 'reports', label: 'Reportes',      Icon: BarChart2,  href: '/reports', permKey: 'global:sidebar:reports' },
  { key: 'users',   label: 'Usuarios',      Icon: Users,      href: '/users',   permKey: 'global:sidebar:users'   },
  { key: 'roles',   label: 'Roles',         Icon: Tag,        href: '/roles',   permKey: 'global:sidebar:roles'   },
  { key: 'trash',   label: 'Papelera',      Icon: Trash2,     href: '/trash',   permKey: 'global:sidebar:trash'   },
];

const SUPERADMIN_NAV = [
  { key: 'config',  label: 'Configuración', Icon: Settings2,  href: '/config',  permKey: 'global:sidebar:config'  },
];

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
  items: Array<{ key: string; label: string; Icon: LucideIcon; href: string; permKey?: string }>;
  isActive: (href: string) => boolean;
}) {
  return (
    <>
      {items.map(({ key, label, Icon, href, permKey }) => {
        const link = (
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
        );
        return permKey
          ? <PermissionGate key={key} perm={permKey}>{link}</PermissionGate>
          : link;
      })}
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

      {visible.map(({ key, label, Icon, href, permKey }) => {
        const link = (
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
        );
        return permKey
          ? <PermissionGate key={key} perm={permKey}>{link}</PermissionGate>
          : link;
      })}
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
  const hasAnyAdminNav    = useHasAnyPermission(
    'global:sidebar:reports', 'global:sidebar:users',
    'global:sidebar:roles',   'global:sidebar:trash',
  );
  const hasConfigNav      = usePermission('global:sidebar:config');

  const { data: company } = useQuery({
    queryKey: ['company-public'],
    queryFn:  systemConfigService.getPublicCompanyInfo,
    staleTime: 600_000,
  });

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
      <div className={styles.brand} aria-label={company?.name ?? 'Sistema de Tickets'}>
        <div className={styles.brandMark} aria-hidden="true">
          {company?.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={company.logo_url}
              alt={company.name}
              style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }}
            />
          ) : (
            <span
              className={styles.brandDot}
              style={company?.primary_color ? { background: company.primary_color } : undefined}
            />
          )}
        </div>
        {expanded && company?.name && (
          <span className={styles.brandName}>{company.name}</span>
        )}
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

            {(isAdmin && hasAnyAdminNav) && (
              <>
                <SectionDivider label="ADMINISTRACIÓN" expanded={expanded} />
                <NavGroup items={ADMIN_NAV} isActive={isActive} />
              </>
            )}

            {(isSuperadmin && hasConfigNav) && (
              <>
                <SectionDivider label="SISTEMA" expanded={expanded} />
                <NavGroup items={SUPERADMIN_NAV} isActive={isActive} />
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
