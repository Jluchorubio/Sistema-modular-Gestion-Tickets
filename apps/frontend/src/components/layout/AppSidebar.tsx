'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid, UserCog, ShieldCheck, BarChart2,
  SlidersHorizontal, Trash2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '@/stores/ui.store';
import { useAuthStore } from '@/stores/auth.store';
import { usePermissionsStore } from '@/stores/permissions.store';
import { systemConfigService } from '@/services/system-config.service';
import type { ModuleNavItem } from '@/types/nav.types';
import styles from './sidebar.module.css';

function PanelToggleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="1em" height="1em" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M0 0h24v24H0z" fill="none" />
      <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        <rect width="18" height="18" x="3" y="3" rx="2" />
        <path d="M9 3v18" />
      </g>
    </svg>
  );
}

// Known module base paths — used only for brand display before store hydrates
const MODULE_PREFIXES = ['/requests', '/inventory', '/helpdesk', '/tickets'];

export function AppSidebar() {
  const expanded      = useUIStore((s) => s.sidebarExpanded);
  const toggleSidebar = useUIStore((s) => s.toggleSidebar);
  const moduleNav     = useUIStore((s) => s.moduleNav);
  const moduleName    = useUIStore((s) => s.moduleName);
  const moduleId      = useUIStore((s) => s.moduleId);
  const pathname      = usePathname();

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  /* Current module role */
  const userModuleRole = moduleId
    ? (user?.module_roles?.find(
        (r) => r.module_id === moduleId && r.status === 'active',
      )?.role_name ?? null)
    : null;

  /* Is admin/jefe of ANY module (for global sidebar visibility) */
  const isAnyModuleAdmin = !isSuperadmin && (user?.module_roles?.some(
    (r) => r.status === 'active' && (r.role_name === 'admin_modulo' || r.role_name === 'jefe_tecnico'),
  ) ?? false);

  /* Global sidebar permission checks */
  const canSeeUsers   = usePermissionsStore((s) => s.loaded && s.hasPermission('global:sidebar:users'));
  const canSeeRoles   = usePermissionsStore((s) => s.loaded && s.hasPermission('global:sidebar:roles'));
  const canSeeReports = usePermissionsStore((s) => s.loaded && s.hasPermission('global:sidebar:reports'));
  const canSeeTrash   = usePermissionsStore((s) => s.loaded && s.hasPermission('global:sidebar:trash'));
  const canSeeConfig  = usePermissionsStore((s) => s.loaded && s.hasPermission('global:sidebar:config'));

  const { data: company } = useQuery({
    queryKey: ['company-public'],
    queryFn:  systemConfigService.getPublicCompanyInfo,
    staleTime: 600_000,
  });

  // Path-based fallback for brand display before store hydrates
  const isModulePath = MODULE_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  );
  const hasModuleCtx = moduleNav !== null || isModulePath;

  const companyName = company?.name ?? '';
  const logoUrl     = company?.logo_url ?? '';

  // "Inicio" item active only on exact base path; all others active on prefix match
  function isActive(href: string, key?: string) {
    if (href === '/dashboard') return pathname === '/dashboard' || pathname === '/';
    if (key === 'inicio')      return pathname === href;
    return pathname === href || pathname.startsWith(href + '/');
  }

  const hasModulePerm = usePermissionsStore((s) => s.hasPermission);
  const permsLoaded   = usePermissionsStore((s) => s.loaded);

  function renderModuleItem(item: ModuleNavItem) {
    const active = isActive(item.href, item.key);

    /* Role-based gating */
    if (item.allowedRoles && !isSuperadmin) {
      if (!userModuleRole || !item.allowedRoles.includes(userModuleRole)) return null;
    }

    /* Permission-based gating */
    if (!isSuperadmin && item.permKey && permsLoaded && !hasModulePerm(item.permKey)) {
      return null;
    }

    return (
      <Link
        key={item.key}
        href={item.href}
        title={item.label}
        aria-label={item.label}
        className={`${styles.navItem}${active ? ` ${styles.navItemActive}` : ''}`}
      >
        <item.Icon className={styles.navIcon} aria-hidden="true" />
        <span className={styles.navLabel}>{item.label}</span>
      </Link>
    );
  }

  function globalNavLink(
    href: string,
    label: string,
    Icon: React.ElementType,
    visible: boolean,
  ) {
    if (!visible) return null;
    const active = isActive(href);
    return (
      <Link
        href={href}
        title={label}
        aria-label={label}
        className={`${styles.navItem}${active ? ` ${styles.navItemActive}` : ''}`}
      >
        <Icon className={styles.navIcon} aria-hidden="true" />
        <span className={styles.navLabel}>{label}</span>
      </Link>
    );
  }

  return (
    <aside className={`${styles.sidebar}${expanded ? ` ${styles.expanded}` : ''}`}>

      {/* ── Brand ── */}
      <div className={styles.brand}>
        {logoUrl ? (
          <div className={styles.logoWrap} aria-label={companyName}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={logoUrl}
              alt={companyName}
              style={{ width: 48, height: 48, objectFit: 'contain', display: 'block' }}
            />
          </div>
        ) : (
          <div className={styles.brandMark} aria-hidden="true">
            <span
              className={styles.brandDot}
              style={{
                background:  'var(--brand-primary)',
                boxShadow:   '0 0 0 3px var(--brand-primary-20)',
              }}
            />
          </div>
        )}

        {expanded && (
          <div className={styles.brandInfo}>
            {companyName && (
              <span className={`${styles.brandName}${hasModuleCtx ? ` ${styles.brandNameCoral}` : ''}`}>
                {companyName}
              </span>
            )}
            {hasModuleCtx && moduleName && (
              <span className={styles.brandModuleName}>{moduleName}</span>
            )}
          </div>
        )}
      </div>

      {/* ── Navigation — dynamic: module nav when in module, global otherwise ── */}
      <nav className={styles.nav} aria-label="Panel principal">

        {moduleNav !== null ? (
          moduleNav.map((item) => renderModuleItem(item))
        ) : (
          <>
            <Link
              href="/dashboard"
              title="Módulos Disponibles"
              aria-label="Módulos Disponibles"
              className={`${styles.navItem}${isActive('/dashboard') ? ` ${styles.navItemActive}` : ''}`}
            >
              <LayoutGrid className={styles.navIcon} aria-hidden="true" />
              <span className={styles.navLabel}>Módulos Disponibles</span>
            </Link>

            {/* Usuarios — superadmin (global) or any module admin (scoped) */}
            {globalNavLink('/users', 'Usuarios', UserCog, canSeeUsers || isAnyModuleAdmin)}

            {/* Roles — superadmin only */}
            {globalNavLink('/roles', 'Roles', ShieldCheck, canSeeRoles)}

            {/* Reportes — superadmin (global) or module admin/jefe */}
            {globalNavLink('/reports', 'Reportes', BarChart2, canSeeReports || isAnyModuleAdmin)}

            {/* Papelera — superadmin (global) or module admin */}
            {globalNavLink('/trash', 'Papelera', Trash2, canSeeTrash || isAnyModuleAdmin)}

            {/* Configuración del Sistema — superadmin only */}
            {globalNavLink('/config', 'Configuración del Sistema', SlidersHorizontal, canSeeConfig)}
          </>
        )}

      </nav>

      {/* ── Bottom: toggle button ── */}
      <div className={styles.bottom}>
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={toggleSidebar}
          title={expanded ? 'Contraer menú' : 'Expandir menú'}
          aria-label={expanded ? 'Contraer menú' : 'Expandir menú'}
        >
          <span className={`${styles.toggleIcon}${expanded ? ` ${styles.toggleIconFlipped}` : ''}`}>
            <PanelToggleIcon />
          </span>
        </button>
      </div>

    </aside>
  );
}
