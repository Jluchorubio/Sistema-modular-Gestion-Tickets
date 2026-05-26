'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleScopedRolesClient } from '@/components/modules/ModuleScopedRolesClient';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';

export default function InventoryRolesPage() {
  const { modules, isLoading } = useModules();
  const inventoryRef = modules?.find(isInventoryModule);
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryRef?.id);

  if (isLoading || !inventoryRef) return <Spinner />;
  return <ModuleScopedRolesClient moduleId={inventoryRef.id} moduleName="Inventario de Activos" />;
}
