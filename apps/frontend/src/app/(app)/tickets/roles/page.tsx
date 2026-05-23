'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { GestionRolesClient } from '@/app/(app)/requests/_components/GestionRolesClient';
import { HELPDESK_NAV, HELPDESK_MODULE_NAME, isHelpdeskModule } from '../_nav';

export default function TicketsRolesPage() {
  const { modules, isLoading } = useModules();
  const helpdeskId = modules?.find(isHelpdeskModule)?.id;
  useModuleNav(HELPDESK_MODULE_NAME, HELPDESK_NAV, helpdeskId);

  if (isLoading || !helpdeskId) return <Spinner />;
  return <GestionRolesClient moduleId={helpdeskId} />;
}
