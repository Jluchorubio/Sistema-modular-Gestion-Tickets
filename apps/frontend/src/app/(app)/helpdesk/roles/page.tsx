'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleScopedRolesClient } from '@/components/modules/ModuleScopedRolesClient';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

export default function HelpdeskRolesPage() {
  const { modules, isLoading } = useModules();
  const helpdeskRef = modules?.find(isHelpdeskModule);
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskRef?.id);

  if (isLoading || !helpdeskRef) return <Spinner />;
  return <ModuleScopedRolesClient moduleId={helpdeskRef.id} moduleName="Mesa de Ayuda" />;
}
