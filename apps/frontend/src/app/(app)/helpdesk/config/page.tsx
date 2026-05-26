'use client';

import { useQuery } from '@tanstack/react-query';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { modulesService } from '@/services/modules.service';
import { ModuleConfigClient } from '@/components/modules/ModuleConfigClient';
import { Spinner } from '@/components/ui/Spinner';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

export default function HelpdeskConfigPage() {
  const { modules, isLoading: modsLoading } = useModules();
  const helpdeskRef = modules?.find(isHelpdeskModule);
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskRef?.id);

  const user         = useAuthStore((s) => s.user);
  const isSuperadmin = user?.is_superadmin ?? false;

  const { data: mod, isLoading: modLoading } = useQuery({
    queryKey: ['module', helpdeskRef?.id],
    queryFn:  () => modulesService.getModule(helpdeskRef!.id),
    enabled:  !!helpdeskRef?.id,
  });

  if (modsLoading || modLoading || !helpdeskRef || !mod) return <Spinner />;

  const isAdminModulo = user?.module_roles?.some(
    (r) => r.module_id === helpdeskRef.id && r.role_name === 'admin_modulo' && r.status === 'active',
  ) ?? false;

  return (
    <ModuleConfigClient
      module={mod}
      moduleId={helpdeskRef.id}
      isSuperadmin={isSuperadmin}
      isAdminModulo={isAdminModulo}
    />
  );
}
