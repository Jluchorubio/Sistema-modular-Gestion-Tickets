'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { Spinner } from '@/components/ui/Spinner';
import { ReportsClient } from '@/app/(app)/reports/_components/ReportsClient';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';

export default function InventoryReportsPage() {
  const { modules, isLoading } = useModules();
  const inventoryId   = modules?.find(isInventoryModule)?.id;
  const authUser      = useAuthStore((s) => s.user);
  const isSuperadmin  = authUser?.is_superadmin ?? false;
  const isAdminModulo = !!inventoryId && !!authUser?.module_roles?.some(
    (r) => r.module_id === inventoryId && r.status === 'active' && r.role_name === 'admin_modulo',
  );
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  if (isLoading) return <Spinner />;

  if (!isSuperadmin && !isAdminModulo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        No tienes permiso para ver esta sección.
      </div>
    );
  }

  return <ReportsClient />;
}
