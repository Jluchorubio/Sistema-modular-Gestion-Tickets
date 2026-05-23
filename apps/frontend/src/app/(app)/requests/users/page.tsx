'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { DynamicUsersClient } from '../_components/DynamicUsersClient';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';

export default function GestionUsersPage() {
  const { modules } = useModules();
  const gestionId = modules?.find(isGestionModule)?.id;
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);
  return <DynamicUsersClient />;
}
