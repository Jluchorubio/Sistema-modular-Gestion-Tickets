'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleScopedUsersClient } from '@/components/modules/ModuleScopedUsersClient';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

export default function HelpdeskUsersPage() {
  const { modules, isLoading } = useModules();
  const helpdeskRef = modules?.find(isHelpdeskModule);
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskRef?.id);

  if (isLoading || !helpdeskRef) return <Spinner />;
  return <ModuleScopedUsersClient moduleId={helpdeskRef.id} scope="module-only" profileBasePath="/helpdesk/users" />;
}
