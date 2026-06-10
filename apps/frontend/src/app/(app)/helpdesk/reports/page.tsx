'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { Spinner } from '@/components/ui/Spinner';
import { HelpdeskReportsClient } from '@/app/(app)/helpdesk/_components/HelpdeskReportsClient';
import { ContextNav } from '@/components/ui/ContextNav';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

export default function HelpdeskReportsPage() {
  const { modules, isLoading } = useModules();
  const helpdeskId  = modules?.find(isHelpdeskModule)?.id;
  const authUser    = useAuthStore((s) => s.user);
  const isSuperadmin   = authUser?.is_superadmin ?? false;
  const isAdminModulo  = !!helpdeskId && !!authUser?.module_roles?.some(
    (r) => r.module_id === helpdeskId && r.status === 'active' && r.role_name === 'admin_modulo',
  );
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  if (isLoading || !helpdeskId) return <Spinner />;

  const nav = <ContextNav back crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Mesa de Ayuda', href: '/helpdesk' }, { label: 'Reportes' }]} />;

  if (!isSuperadmin && !isAdminModulo) {
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
      <HelpdeskReportsClient moduleId={helpdeskId} />
    </>
  );
}
