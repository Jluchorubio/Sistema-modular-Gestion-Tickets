'use client';

import { useQuery } from '@tanstack/react-query';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient } from '@/components/modules/ModuleConfigClient';
import { Spinner } from '@/components/ui/Spinner';
import { INVENTORY_NAV, INVENTORY_MODULE_NAME, isInventoryModule } from '../_nav';

export default function InventoryConfigPage() {
  const { modules, isLoading: modsLoading } = useModules();
  const inventoryRef = modules?.find(isInventoryModule);
  useModuleNav(INVENTORY_MODULE_NAME, INVENTORY_NAV, inventoryRef?.id);

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: mod, isLoading: modLoading } = useQuery({
    queryKey: ['module', inventoryRef?.id],
    queryFn:  () => modulesService.getModule(inventoryRef!.id),
    enabled:  !!inventoryRef?.id,
  });

  if (modsLoading || modLoading || !inventoryRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    (r) => r.module_id === inventoryRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <ModuleConfigClient
      module={mod}
      moduleId={inventoryRef.id}
      isSuperadmin={isSuperadmin}
      isAdminModulo={isAdminModulo}
    />
  );
}
