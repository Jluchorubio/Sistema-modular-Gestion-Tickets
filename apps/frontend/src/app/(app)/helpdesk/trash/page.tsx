'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleTrashClient } from '@/app/(app)/requests/_components/ModuleTrashClient';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '@/app/(app)/tickets/_nav';

export default function HelpdeskTrashPage() {
  const { modules, isLoading } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  if (isLoading || !helpdeskId) return <Spinner />;
  return <ModuleTrashClient itemType="ticket" />;
}
