'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid, UserCog, ShieldCheck, BarChart2,
  Settings2, SlidersHorizontal, Trash2,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useUIStore } from '@/stores/ui.store';
import { PermissionGate } from '@/components/auth/PermissionGate';
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
  const pathname      = usePathname();

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

  function renderModuleItem(item: ModuleNavItem) {
    const active = isActive(item.href, item.key);
    const link = (
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
    return item.permKey
      ? <PermissionGate key={item.key} perm={item.permKey}>{link}</PermissionGate>
      : link;
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

      {/* ── Navigation ── */}
      <nav className={styles.nav} aria-label="Panel principal">

        {moduleNav !== null ? (
          /* ── Module context: render module-specific nav items ── */
          moduleNav.map(renderModuleItem)
        ) : (
          /* ── Global context: render system-wide nav items ── */
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

            <PermissionGate perm="global:sidebar:users">
              <Link
                href="/users"
                title="Usuarios"
                aria-label="Usuarios"
                className={`${styles.navItem}${isActive('/users') ? ` ${styles.navItemActive}` : ''}`}
              >
                <UserCog className={styles.navIcon} aria-hidden="true" />
                <span className={styles.navLabel}>Usuarios</span>
              </Link>
            </PermissionGate>

            <PermissionGate perm="global:sidebar:roles">
              <Link
                href="/roles"
                title="Roles"
                aria-label="Roles"
                className={`${styles.navItem}${isActive('/roles') ? ` ${styles.navItemActive}` : ''}`}
              >
                <ShieldCheck className={styles.navIcon} aria-hidden="true" />
                <span className={styles.navLabel}>Roles</span>
              </Link>
            </PermissionGate>

            <PermissionGate perm="global:sidebar:reports">
              <Link
                href="/reports"
                title="Reportes"
                aria-label="Reportes"
                className={`${styles.navItem}${isActive('/reports') ? ` ${styles.navItemActive}` : ''}`}
              >
                <BarChart2 className={styles.navIcon} aria-hidden="true" />
                <span className={styles.navLabel}>Reportes</span>
              </Link>
            </PermissionGate>

            <PermissionGate perm="global:sidebar:trash">
              <Link
                href="/trash"
                title="Papelera"
                aria-label="Papelera"
                className={`${styles.navItem}${isActive('/trash') ? ` ${styles.navItemActive}` : ''}`}
              >
                <Trash2 className={styles.navIcon} aria-hidden="true" />
                <span className={styles.navLabel}>Papelera</span>
              </Link>
            </PermissionGate>

            <PermissionGate perm="global:sidebar:config">
              <Link
                href="/config"
                title="Configuración del Sistema"
                aria-label="Configuración del Sistema"
                className={`${styles.navItem}${isActive('/config') ? ` ${styles.navItemActive}` : ''}`}
              >
                <SlidersHorizontal className={styles.navIcon} aria-hidden="true" />
                <span className={styles.navLabel}>Configuración del Sistema</span>
              </Link>
            </PermissionGate>
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
