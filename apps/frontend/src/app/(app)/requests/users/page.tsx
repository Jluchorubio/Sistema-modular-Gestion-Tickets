'use client';

import { useModules } from '@/hooks/useModules';
import { useModuleNav } from '@/hooks/useModuleNav';
import { useAuthStore } from '@/stores/auth.store';
import { ModuleScopedUsersClient } from '@/components/modules/ModuleScopedUsersClient';
import { GESTION_NAV, GESTION_MODULE_NAME, isGestionModule } from '../_nav';
import { MODULE_ROLES } from '@/constants/roles';

export default function GestionUsersPage() {
  const { modules } = useModules();
  const gestionRef  = modules?.find(isGestionModule);
  const { user }    = useAuthStore();
  useModuleNav(GESTION_MODULE_NAME, GESTION_NAV, gestionRef?.id);

  if (!gestionRef) return null;

  const isSuperadmin  = user?.is_superadmin ?? false;
  const isAdminModulo = user?.module_roles?.some(
    r => r.module_id === gestionRef.id && r.status === 'active' && r.role_name === MODULE_ROLES.ADMIN_MODULO,
  ) ?? false;
  const scope = (isSuperadmin || isAdminModulo) ? 'all' : 'module-only';

  return <ModuleScopedUsersClient moduleId={gestionRef.id} scope={scope} profileBasePath="/requests/users" />;
}
