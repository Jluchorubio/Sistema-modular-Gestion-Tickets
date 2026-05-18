'use client';
import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { ModuleUsersClient } from '../_components/ModuleUsersClient';
import { GESTION_NAV, GESTION_MODULE_NAME } from '../_nav';

export default function GestionUsersPage() {
  const { modules } = useModules();
  const gestionId = modules?.find(m => ['gestion', 'gestion-adm'].includes(m.slug))?.id;
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionId);
  return <ModuleUsersClient />;
}
