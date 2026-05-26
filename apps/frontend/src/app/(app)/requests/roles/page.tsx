'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { Spinner } from '@/components/ui/Spinner';
import { ModuleScopedRolesClient } from '@/components/modules/ModuleScopedRolesClient';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';

export default function GestionRolesPage() {
  const { modules, isLoading } = useModules();
  const gestionRef = modules?.find(isGestionModule);
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionRef?.id);

  if (isLoading || !gestionRef) return <Spinner />;
  return <ModuleScopedRolesClient moduleId={gestionRef.id} moduleName="Gestión Administrativa" />;
}
