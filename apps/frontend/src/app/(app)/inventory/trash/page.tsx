'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleTrashClient } from '@/app/(app)/requests/_components/ModuleTrashClient';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';

export default function InventoryTrashPage() {
  const { modules, isLoading } = useModules();
  const inventoryId  = modules?.find(isInventoryModule)?.id;
  const authUser     = useAuthStore((s) => s.user);
  const isSuperadmin = authUser?.is_superadmin ?? false;
  const isAdminModulo = !!inventoryId && !!authUser?.module_roles?.some(
    (r) => r.module_id === inventoryId && r.status === 'active' && r.role_name === 'admin_modulo',
  );
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  if (isLoading || !inventoryId) return <Spinner />;

  if (!isSuperadmin && !isAdminModulo) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#ef4444', fontSize: 14 }}>
        No tienes permiso para ver esta sección.
      </div>
    );
  }

  return <ModuleTrashClient itemType="asset" />;
}
