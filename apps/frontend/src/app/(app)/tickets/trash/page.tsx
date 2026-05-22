'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { ModuleTrashClient } from '@/app/(app)/requests/_components/ModuleTrashClient';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';

export default function TicketsTrashPage() {
  const { modules } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);
  return <ModuleTrashClient itemType="ticket" />;
}
