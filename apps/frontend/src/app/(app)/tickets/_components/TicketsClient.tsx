'use client';

import { useMemo } from 'react';
import { useAuthStore } from '@/stores/auth.store';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useModules } from '@/hooks/useModules';
import { ModuleLayout } from '@/components/layout/ModuleLayout';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';
import { buildDynamicModuleNav } from '../../modules/[id]/_nav';
import { usePermission } from '@/hooks/usePermission';
import { ADMIN_ROLES, TECH_ROLES } from '@/constants/roles';
import { AdminView } from './views/AdminView';
import { TechView } from './views/TechView';
import { UserView } from './views/UserView';

/* ─────────────────── Main component ─────────────────────────────────────── */

interface TicketsClientProps {
  forcedModuleId?:   string;
  forcedModuleSlug?: string;
  forcedModuleName?: string;
  forcedModuleDesc?: string | null;
  visualVariant?: 'helpdeskMockup' | 'default';
}

export function TicketsClient({
  forcedModuleId,
  forcedModuleSlug,
  forcedModuleName,
  forcedModuleDesc,
  visualVariant = 'helpdeskMockup',
}: TicketsClientProps = {}) {
  const { modules } = useModules();
  const isForced    = !!forcedModuleId;

  const helpdeskId   = !isForced ? modules?.find(isHelpdeskModule)?.id : undefined;
  const moduleId     = forcedModuleId ?? helpdeskId ?? '';
  const moduleSlug   = forcedModuleSlug ?? 'helpdesk';
  const ticketBasePath = `/${moduleSlug}`;

  const navItems = useMemo(
    () => isForced && forcedModuleSlug ? buildDynamicModuleNav(forcedModuleSlug) : HELPDESK_NAV,
    [isForced, forcedModuleSlug],
  );
  useModuleNav(
    isForced ? (forcedModuleName ?? '') : HELPDESK_MODULE_NAME,
    navItems,
    moduleId || undefined,
  );

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const moduleRole = useMemo(() => {
    if (!user || !moduleId) return null;
    return user.module_roles.find(
      (r) => r.module_id === moduleId && r.status === 'active',
    )?.role_name ?? null;
  }, [user, moduleId]);

  const isAdminView = isSuperadmin || ADMIN_ROLES.includes(moduleRole as any);
  const isTechView  = !isAdminView && TECH_ROLES.includes(moduleRole as any);

  const canCreate = usePermission('helpdesk:tickets:create');

  const layoutTitle = isForced ? (forcedModuleName ?? '') : 'Mesa de Ayuda';
  const layoutDesc  = isForced
    ? (forcedModuleDesc ?? null)
    : 'Sistema centralizado de soporte técnico. Gestiona incidencias, solicitudes y seguimiento SLA.';


  return (
    <ModuleLayout
      moduleId={moduleId || undefined}
      title={layoutTitle}
      description={layoutDesc}
      isSuperadmin={isSuperadmin}
    >
      {isAdminView ? (
        <AdminView moduleId={moduleId} basePath={ticketBasePath} canCreate={canCreate} visualVariant={visualVariant} />
      ) : isTechView && user ? (
        <TechView user={user} moduleId={moduleId} basePath={ticketBasePath} moduleRole={moduleRole!} canCreate={canCreate} visualVariant={visualVariant} />
      ) : (
        <UserView moduleId={moduleId} basePath={ticketBasePath} canCreate={canCreate} visualVariant={visualVariant} />
      )}
    </ModuleLayout>
  );
}
