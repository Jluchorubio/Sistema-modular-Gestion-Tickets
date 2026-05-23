'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { GestionRolesClient } from '@/app/(app)/requests/_components/GestionRolesClient';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';

export default function InventoryRolesPage() {
  const { modules, isLoading } = useModules();
  const inventoryId = modules?.find(isInventoryModule)?.id;
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryId);

  if (isLoading || !inventoryId) return <Spinner />;
  return <GestionRolesClient moduleId={inventoryId} />;
}
