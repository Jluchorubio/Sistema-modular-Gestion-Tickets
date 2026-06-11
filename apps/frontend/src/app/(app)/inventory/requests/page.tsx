'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { usePermission } from '@/hooks/usePermission';
import { Spinner } from '@/components/ui/Spinner';
import { ContextNav } from '@/components/ui/ContextNav';
import { AdminView } from '@/app/(app)/requests/_components/AdminView';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '@/app/(app)/inventory/_nav';

export default function InventoryRequestsPage() {
  const { modules, isLoading } = useModules();
  const inventoryModule = modules?.find(isInventoryModule);
  const inventoryId     = inventoryModule?.id;

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;
  const canViewAll   = usePermission('gestion:requests:view_all');

  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  if (isLoading) return <Spinner />;

  const nav = (
    <ContextNav
      back
      crumbs={[
        { label: 'Dashboard',  href: '/dashboard'  },
        { label: 'Inventario', href: '/inventory'  },
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
      <AdminView isSuperadmin={isSuperadmin} moduleId={inventoryId} />
    </>
  );
}
