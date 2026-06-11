'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { Spinner } from '@/components/ui/Spinner';
import { ContextNav } from '@/components/ui/ContextNav';
import { AdminView } from '@/app/(app)/requests/_components/AdminView';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

export default function HelpdeskRequestsPage() {
  const { modules, isLoading } = useModules();
  const helpdeskModule = modules?.find(isHelpdeskModule);
  const helpdeskId     = helpdeskModule?.id;

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;
  const canViewAll   = usePermission('gestion:requests:view_all');

  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  if (isLoading) return <Spinner />;

  const nav = (
    <ContextNav
      back
      crumbs={[
        { label: 'Dashboard',  href: '/dashboard' },
        { label: 'Helpdesk',   href: '/helpdesk'  },
        { label: 'Solicitudes' },
      ]}
    />
  );

  if (!isSuperadmin && !canViewAll) {
    return (
      <>
        {nav}
        <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
          No tienes permiso para ver esta sección.
        </div>
      </>
    );
  }

  return (
    <>
      {nav}
      <AdminView isSuperadmin={isSuperadmin} moduleId={helpdeskId} />
    </>
  );
}
