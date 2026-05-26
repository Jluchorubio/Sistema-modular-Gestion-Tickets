'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { ModuleScopedUsersClient } from '@/components/modules/ModuleScopedUsersClient';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';

export default function GestionUsersPage() {
  const { modules } = useModules();
  const gestionRef = modules?.find(isGestionModule);
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionRef?.id);

  if (!gestionRef) return null;
  return <ModuleScopedUsersClient moduleId={gestionRef.id} scope="all" profileBasePath="/requests/users" />;
}
