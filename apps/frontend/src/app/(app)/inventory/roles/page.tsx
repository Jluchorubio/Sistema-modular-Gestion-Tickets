'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleScopedRolesClient } from '@/components/modules/ModuleScopedRolesClient';
import { ContextNav } from '@/components/ui/ContextNav';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';

export default function InventoryRolesPage() {
  const { modules, isLoading } = useModules();
  const inventoryRef = modules?.find(isInventoryModule);
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryRef?.id);

  if (isLoading || !inventoryRef) return <Spinner />;
  return (
    <>
      <ContextNav back crumbs={[{ label: 'Dashboard', href: '/dashboard' }, { label: 'Inventario', href: '/inventory' }, { label: 'Roles' }]} />
      <ModuleScopedRolesClient moduleId={inventoryRef.id} moduleName="Inventario de Activos" />
    </>
  );
}
