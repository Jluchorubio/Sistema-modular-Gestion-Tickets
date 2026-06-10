'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { ModuleScopedUsersClient } from '@/components/modules/ModuleScopedUsersClient';
import { ContextNav } from '@/components/ui/ContextNav';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';

export default function InventoryUsersPage() {
  const { modules } = useModules();
  const inventoryRef = modules?.find(isInventoryModule);
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryRef?.id);

  if (!inventoryRef) return null;
  return (
    <>
      <ContextNav back crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Inventario', href: '/inventory' }, { label: 'Usuarios' }]} />
      <ModuleScopedUsersClient moduleId={inventoryRef.id} scope="all" profileBasePath="/inventory/users" />
    </>
  );
}
